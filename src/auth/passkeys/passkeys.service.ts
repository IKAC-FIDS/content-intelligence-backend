import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserPasskey } from '@prisma/client';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { randomUUID } from 'crypto';
import NodeCache from 'node-cache';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth.service';
import { StartPasskeyRegistrationDto } from './dto/start-passkey-registration.dto';
import { VerifyPasskeyAuthenticationDto } from './dto/verify-passkey-authentication.dto';
import { VerifyPasskeyRegistrationDto } from './dto/verify-passkey-registration.dto';
import { TenantResolverService } from '../../organization-memberships/tenant-resolver.service';

type RegistrationResponse = Parameters<typeof verifyRegistrationResponse>[0]['response'];
type AuthenticationResponse = Parameters<typeof verifyAuthenticationResponse>[0]['response'];

const CHALLENGE_TTL_SECONDS = 5 * 60;

@Injectable()
export class PasskeysService {
  private challenges = new NodeCache({ stdTTL: CHALLENGE_TTL_SECONDS, checkperiod: 60 });

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private authService: AuthService,
    private audit: AuditLogService,
    private tenantResolver: TenantResolverService,
  ) {}

  async listMine(user: CurrentUserPayload) {
    const passkeys = await this.prisma.userPasskey.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
    });

    return passkeys.map((item) => this.toMetadata(item));
  }

  async startRegistration(user: CurrentUserPayload, dto: StartPasskeyRegistrationDto) {
    const account = await this.prisma.user.findUnique({
      where: { id: user.userId },
      include: { passkeys: true },
    });
    if (!account || !account.isActive) throw new UnauthorizedException('User is not active');

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: Buffer.from(account.id),
      userName: account.email,
      userDisplayName: account.fullName,
      attestationType: 'none',
      excludeCredentials: account.passkeys.map((item) => ({
        id: item.credentialId,
        transports: item.transports as any,
      })),
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
    });

    this.challenges.set(this.registrationKey(user.userId), options.challenge);

    return options;
  }

  async verifyRegistration(user: CurrentUserPayload, dto: VerifyPasskeyRegistrationDto) {
    const expectedChallenge = this.challenges.get<string>(this.registrationKey(user.userId));
    if (!expectedChallenge) throw new BadRequestException('Passkey registration challenge expired');

    const verification = await verifyRegistrationResponse({
      response: dto.response as unknown as RegistrationResponse,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      requireUserVerification: true,
    }).catch(() => {
      throw new BadRequestException('Passkey registration failed');
    });

    if (!verification.verified) throw new BadRequestException('Passkey registration failed');

    const { credential, credentialBackedUp, credentialDeviceType } = verification.registrationInfo;
    const existing = await this.prisma.userPasskey.findUnique({ where: { credentialId: credential.id } });
    if (existing) throw new BadRequestException('Passkey is already registered');

    const created = await this.prisma.userPasskey.create({
      data: {
        userId: user.userId,
        credentialId: credential.id,
        credentialPublicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports?.map(String) ?? [],
        backedUp: credentialBackedUp,
        credentialDeviceType,
        deviceName: dto.deviceName?.trim() || undefined,
      },
    });

    this.challenges.del(this.registrationKey(user.userId));
    await this.audit.record({
      actorId: user.userId,
      entityType: 'user_passkey',
      entityId: created.id,
      action: 'passkey.registered',
      after: this.toMetadata(created),
    });

    return this.toMetadata(created);
  }

  async deleteMine(user: CurrentUserPayload, id: string) {
    const passkey = await this.prisma.userPasskey.findFirst({ where: { id, userId: user.userId } });
    if (!passkey) throw new NotFoundException('Passkey not found');

    await this.prisma.userPasskey.delete({ where: { id } });
    await this.audit.record({
      actorId: user.userId,
      entityType: 'user_passkey',
      entityId: id,
      action: 'passkey.deleted',
      before: this.toMetadata(passkey),
    });

    return { id, deleted: true };
  }

  async startAuthentication() {
    const challengeId = randomUUID();
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: 'required',
    });

    this.challenges.set(this.authenticationKey(challengeId), options.challenge);

    return { challengeId, options };
  }

  async verifyAuthentication(dto: VerifyPasskeyAuthenticationDto) {
    const expectedChallenge = this.challenges.get<string>(this.authenticationKey(dto.challengeId));
    if (!expectedChallenge) throw new BadRequestException('Passkey authentication challenge expired');

    const response = dto.response as unknown as AuthenticationResponse;
    const credentialId = typeof response.id === 'string' ? response.id : undefined;
    if (!credentialId) throw new UnauthorizedException('Passkey authentication failed');

    const passkey = await this.prisma.userPasskey.findUnique({
      where: { credentialId },
      include: { user: true },
    });
    if (!passkey || !passkey.user?.isActive) {
      await this.recordLoginFailure(credentialId);
      throw new UnauthorizedException('Passkey authentication failed');
    }

    const tenant = await this.authService.resolveLoginContext(passkey.user.id);
    if (tenant) {
      const settings = await this.prisma.organizationSettings.findUnique({
        where: { organizationId: tenant.organizationId },
        select: { allowPasskeyLogin: true },
      });
      if (settings?.allowPasskeyLogin === false) {
        throw new UnauthorizedException('Passkey login is disabled for this Organization');
      }
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.credentialPublicKey),
        counter: passkey.counter,
        transports: passkey.transports as any,
      },
      requireUserVerification: true,
    }).catch(async () => {
      await this.recordLoginFailure(credentialId, passkey.id, passkey.userId);
      throw new UnauthorizedException('Passkey authentication failed');
    });

    if (!verification.verified) {
      await this.recordLoginFailure(credentialId, passkey.id, passkey.userId);
      throw new UnauthorizedException('Passkey authentication failed');
    }

    await this.prisma.userPasskey.update({
      where: { id: passkey.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        backedUp: verification.authenticationInfo.credentialBackedUp,
        credentialDeviceType: verification.authenticationInfo.credentialDeviceType,
        lastUsedAt: new Date(),
      },
    });
    this.challenges.del(this.authenticationKey(dto.challengeId));

    await this.audit.record({
      actorId: passkey.userId,
      entityType: 'user_passkey',
      entityId: passkey.id,
      action: 'passkey.login_success',
      metadata: { credentialId: passkey.credentialId },
    });

    return this.authService.buildLoginResponse(passkey.user, tenant);
  }

  async listForUser(userId: string) {
    await this.assertUserExists(userId);
    const passkeys = await this.prisma.userPasskey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return passkeys.map((item) => this.toMetadata(item));
  }

  async adminDelete(userId: string, passkeyId: string, actorId?: string) {
    await this.assertUserExists(userId);
    const passkey = await this.prisma.userPasskey.findFirst({ where: { id: passkeyId, userId } });
    if (!passkey) throw new NotFoundException('Passkey not found');

    await this.prisma.userPasskey.delete({ where: { id: passkeyId } });
    await this.audit.record({
      actorId,
      entityType: 'user_passkey',
      entityId: passkeyId,
      action: 'passkey.admin_deleted',
      before: this.toMetadata(passkey),
      metadata: { userId },
    });

    return { id: passkeyId, deleted: true };
  }

  private toMetadata(passkey: UserPasskey) {
    return {
      id: passkey.id,
      deviceName: passkey.deviceName,
      createdAt: passkey.createdAt,
      updatedAt: passkey.updatedAt,
      lastUsedAt: passkey.lastUsedAt,
      transports: passkey.transports,
      backedUp: passkey.backedUp,
      credentialDeviceType: passkey.credentialDeviceType,
    };
  }

  private async assertUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
  }

  private async recordLoginFailure(credentialId: string, passkeyId?: string, userId?: string) {
    await this.audit.record({
      actorId: userId,
      entityType: 'user_passkey',
      entityId: passkeyId,
      action: 'passkey.login_failed',
      metadata: { credentialId },
    });
  }

  private registrationKey(userId: string) {
    return `passkey:registration:${userId}`;
  }

  private authenticationKey(challengeId: string) {
    return `passkey:authentication:${challengeId}`;
  }

  private get rpName() {
    return this.config.get<string>('WEBAUTHN_RP_NAME', 'IAM CRM');
  }

  private get rpID() {
    return this.config.get<string>('WEBAUTHN_RP_ID', 'localhost');
  }

  private get origin() {
    return this.config.get<string>('WEBAUTHN_ORIGIN', 'http://localhost:5173');
  }
}
