import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditActorType, AuditResult, AuditSource, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { buildHttpLogContext } from '../common/logging/http-log-context';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenService } from './refresh-token.service';
import { OrganizationMembershipsService } from '../organization-memberships/organization-memberships.service';
import {
  ResolvedTenantContext,
  TenantResolverService,
} from '../organization-memberships/tenant-resolver.service';

export interface AuthUserResponse {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  team: string | null;
  teamId: string | null;
  teamCode: string | null;
  teamName: string | null;
  organizationId: string | null;
  permissions: string[];
  roleId: string | null;
  roleCode: string;
  roleName: string;
  avatarObjectKey: string | null;
}

export interface AuthAccessResponse {
  accessToken: string;
  accessTokenExpiresIn: string;
  user: AuthUserResponse;
}

export interface AuthSessionLoginResponse extends AuthAccessResponse {
  refreshToken: string;
  refreshTokenMaxAgeMs: number;
  refreshTokenExpiresAt: Date;
  refreshSessionId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly config: ConfigService,
    private readonly memberships: OrganizationMembershipsService,
    private readonly tenantResolver: TenantResolverService,
    private readonly audit: AuditLogService,
  ) {}

  async login(dto: LoginDto, req?: Request): Promise<AuthSessionLoginResponse> {
    this.logger.log(
      'Login attempt received',
      JSON.stringify(this.buildAuthLogContext(dto.email, req)),
    );

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    this.logger.log(
      'Login user lookup completed',
      JSON.stringify({
        ...this.buildAuthLogContext(dto.email, req),
        found: Boolean(user),
      }),
    );

    if (!user || !user.isActive) {
      this.logger.warn(
        user ? 'Login rejected: user is inactive' : 'Login rejected: user not found',
        JSON.stringify(this.buildAuthLogContext(dto.email, req)),
      );
      await this.audit.record({
        actorId: user?.id ?? null,
        actorType: user ? AuditActorType.USER : AuditActorType.ANONYMOUS,
        entityType: 'authentication',
        action: 'auth.login.failed',
        source: AuditSource.AUTH,
        result: AuditResult.FAILURE,
        errorCode: user ? 'ACCOUNT_INACTIVE' : 'INVALID_CREDENTIALS',
        metadata: { identifierFingerprint: this.identifierFingerprint(dto.email) },
      });
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.logger.warn(
        'Login rejected: user account is locked',
        JSON.stringify(this.buildAuthLogContext(dto.email, req)),
      );
      throw new UnauthorizedException(
        'حساب کاربری موقتاً قفل شده است. لطفاً بعداً دوباره تلاش کنید',
      );
    }

    const passwordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      this.logger.warn(
        'Login password verification failed',
        JSON.stringify(this.buildAuthLogContext(dto.email, req)),
      );
      await this.recordFailedLogin(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }

    this.logger.log(
      'Login password verification succeeded',
      JSON.stringify(this.buildAuthLogContext(dto.email, req)),
    );

    const tenant = await this.resolveLoginContext(user.id, this.requestId(req));
    if (tenant) {
      const settings = await this.prisma.organizationSettings.findUnique({
        where: { organizationId: tenant.organizationId },
        select: { allowPasswordLogin: true },
      });
      if (settings?.allowPasswordLogin === false) {
        throw new ForbiddenException('Password login is disabled for this Organization');
      }
    }
    await this.recordSuccessfulLogin(user.id, req, tenant);

    return this.buildSessionLoginResponse(user, req, tenant);
  }

  async refresh(
    refreshToken: string,
    req?: Request,
  ): Promise<AuthSessionLoginResponse> {
    const activeSession = await this.refreshTokenService.getActiveSession(refreshToken);
    const refreshContext = activeSession.tenantContext;
    const effective = refreshContext && !('platformOnly' in refreshContext)
      ? await this.tenantResolver.resolveAuthenticatedTenant(activeSession.user.id, {
          claims: refreshContext,
          requestId: this.requestId(req),
        })
      : await this.resolveLoginContext(
          activeSession.user.id,
          this.requestId(req),
          Boolean(refreshContext && 'platformOnly' in refreshContext),
        );
    const rotated = await this.refreshTokenService.rotateRefreshToken(
      refreshToken,
      req,
      effective
        ? {
            activeOrganizationId: effective.organizationId,
            membershipId: effective.membershipId,
          }
        : { platformOnly: true },
    );

    const accessResponse = await this.buildLoginResponse(rotated.user, effective);

    return {
      ...accessResponse,
      refreshToken: rotated.refreshToken,
      refreshTokenMaxAgeMs: rotated.refreshTokenMaxAgeMs,
      refreshTokenExpiresAt: rotated.refreshTokenExpiresAt,
      refreshSessionId: rotated.refreshSessionId,
    };
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    await this.refreshTokenService.revokeByToken(refreshToken, 'LOGOUT');
  }

  async logoutAll(userId: string): Promise<{ revokedCount: number }> {
    const revokedCount = await this.refreshTokenService.revokeAllUserSessions(
      userId,
      'LOGOUT_ALL',
    );

    return { revokedCount };
  }

  async buildSessionLoginResponse(
    user: User,
    req?: Request,
    resolved?: ResolvedTenantContext | null,
  ): Promise<AuthSessionLoginResponse> {
    const context = this.buildAuthLogContext(user.email, req);
    this.logger.log('Login token generation started', JSON.stringify(context));

    try {
      const effective =
        resolved === undefined
          ? await this.resolveLoginContext(user.id, this.requestId(req))
          : resolved;
      const accessResponse = await this.buildLoginResponse(user, effective);
      const refreshSession = await this.refreshTokenService.createSession(
        user.id,
        req,
        undefined,
        effective
          ? {
              activeOrganizationId: effective.organizationId,
              membershipId: effective.membershipId,
            }
          : { platformOnly: true },
      );

      this.logger.log('Login token generation succeeded', JSON.stringify(context));
      return { ...accessResponse, ...refreshSession };
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Login token generation failed', stack, JSON.stringify(context));
      throw error;
    }
  }

  async buildLoginResponse(
    user: User,
    resolved?: ResolvedTenantContext | null,
  ): Promise<AuthAccessResponse> {
    const effective =
      resolved === undefined ? await this.resolveLoginContext(user.id) : resolved;
    const effectiveRole = effective?.role ?? user.role;
    const effectiveRoleId = effective?.roleId ?? user.roleId;
    const assignedRole = effectiveRoleId
      ? await this.prisma.role.findUnique({ where: { id: effectiveRoleId } })
      : null;
    const payload = {
      sub: user.id,
      email: user.email,
      role: effectiveRole,
      team: effective?.team ?? null,
      teamId: effective?.teamId ?? null,
      teamCode: effective?.teamCode ?? null,
      teamName: effective?.teamName ?? null,
      ...(effective && {
        organizationId: effective.organizationId,
        activeOrganizationId: effective.organizationId,
        membershipId: effective.membershipId,
      }),
    };

    await this.memberships.touchLastAccess(effective?.membershipId ?? null);

    return {
      accessToken: await this.jwtService.signAsync(payload),
      accessTokenExpiresIn: this.config.get<string>('JWT_EXPIRES_IN', '15m'),
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: effectiveRole,
        team: effective?.team ?? null,
        teamId: effective?.teamId ?? null,
        teamCode: effective?.teamCode ?? null,
        teamName: effective?.teamName ?? null,
        organizationId: effective?.organizationId ?? null,
        permissions: effective ? [...effective.permissions] : [],
        roleId: assignedRole?.id ?? null,
        roleCode: assignedRole?.code ?? effectiveRole,
        roleName: assignedRole?.name ?? effectiveRole,
        avatarObjectKey: user.avatarObjectKey,
      },
    };
  }

  async resolveLoginContext(
    userId: string,
    requestId?: string | null,
    platformOnly = false,
  ): Promise<ResolvedTenantContext | null> {
    if (!platformOnly) {
      try {
        return await this.tenantResolver.resolveAuthenticatedTenant(userId, {
          claims: undefined,
          requestId,
        });
      } catch (error) {
        const authority = await this.prisma.platformAuthority.findUnique({
          where: { userId },
          select: { role: true, user: { select: { isActive: true } } },
        });
        if (authority?.user.isActive && authority.role === 'PLATFORM_ADMIN') {
          return null;
        }
        throw error;
      }
    }

    const authority = await this.prisma.platformAuthority.findUnique({
      where: { userId },
      select: { role: true, user: { select: { isActive: true } } },
    });
    if (!authority?.user.isActive || authority.role !== 'PLATFORM_ADMIN') {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return null;
  }

  async switchTenant(
    user: CurrentUserPayload,
    organizationId: string,
    refreshToken: string,
    req?: Request,
  ): Promise<AuthSessionLoginResponse> {
    const requestId = this.requestId(req);
    try {
      const activeSession = await this.refreshTokenService.getActiveSession(refreshToken);
      if (activeSession.user.id !== user.userId) {
        throw new ForbiddenException('Tenant selection is not permitted');
      }
      const current = await this.tenantResolver.resolveAuthenticatedTenant(
        user.userId,
        {
          claims:
            activeSession.tenantContext &&
            !('platformOnly' in activeSession.tenantContext)
              ? activeSession.tenantContext
              : undefined,
          requestId,
        },
      );
      if (
        user.tenantContext &&
        (current.organizationId !== user.tenantContext.organizationId ||
          current.membershipId !== user.tenantContext.membershipId)
      ) {
        throw new ForbiddenException('Tenant selection is not permitted');
      }

      const selected = await this.tenantResolver.selectTenant(
        user.userId,
        organizationId,
        requestId,
      );
      const rotated = await this.refreshTokenService.rotateRefreshToken(
        refreshToken,
        req,
        {
          activeOrganizationId: selected.organizationId,
          membershipId: selected.membershipId,
        },
      );
      const accessResponse = await this.buildLoginResponse(
        activeSession.user,
        selected,
      );
      await this.audit
        .record({
          actorId: user.userId,
          organizationId: selected.organizationId,
          entityType: 'organization-membership',
          entityId: selected.membershipId,
          action: 'tenant.switched',
          requestId,
          metadata: {
            previousMembershipId: current.membershipId,
            newMembershipId: selected.membershipId,
          },
        })
        .catch((auditError) => {
          this.logger.error(
            `Tenant switch audit failed requestId=${requestId ?? 'none'}`,
            auditError instanceof Error ? auditError.stack : undefined,
          );
        });
      return {
        ...accessResponse,
        refreshToken: rotated.refreshToken,
        refreshTokenMaxAgeMs: rotated.refreshTokenMaxAgeMs,
        refreshTokenExpiresAt: rotated.refreshTokenExpiresAt,
        refreshSessionId: rotated.refreshSessionId,
      };
    } catch (error) {
      await this.audit
        .record({
          actorId: user.userId,
          entityType: 'tenant-session',
          action: 'tenant.switch-rejected',
          requestId,
          metadata: { reason: 'candidate-not-authorized' },
        })
        .catch(() => undefined);
      if (error instanceof UnauthorizedException) throw error;
      throw new ForbiddenException('Tenant selection is not permitted');
    }
  }

  toPublicAuthResponse(result: AuthSessionLoginResponse): AuthAccessResponse {
    const {
      refreshToken,
      refreshTokenMaxAgeMs,
      refreshTokenExpiresAt,
      refreshSessionId,
      tenantContext,
      ...publicResponse
    } = result as AuthSessionLoginResponse & { tenantContext?: unknown };

    void refreshToken;
    void refreshTokenMaxAgeMs;
    void refreshTokenExpiresAt;
    void refreshSessionId;
    void tenantContext;

    return publicResponse;
  }

  private async recordFailedLogin(
    userId: string,
    currentFailedAttempts: number,
  ): Promise<void> {
    const nextFailedAttempts = currentFailedAttempts + 1;
    const shouldLock = nextFailedAttempts >= 5;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: nextFailedAttempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + 15 * 60 * 1000)
          : null,
      },
    });
    await this.audit.record({
      actorId: userId,
      entityType: 'authentication',
      entityId: userId,
      action: 'auth.login.failed',
      source: AuditSource.AUTH,
      result: AuditResult.FAILURE,
      errorCode: shouldLock ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
      metadata: { failedAttemptCount: nextFailedAttempts },
    });
  }

  private async recordSuccessfulLogin(
    userId: string,
    req?: Request,
    tenant?: ResolvedTenantContext | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: this.extractIpAddress(req),
      },
    });
    await this.audit.record({
      actorId: userId,
      organizationId: tenant?.organizationId ?? null,
      actorMembershipId: tenant?.membershipId ?? null,
      entityType: 'authentication',
      entityId: userId,
      action: 'auth.login.success',
      source: AuditSource.AUTH,
      result: AuditResult.SUCCESS,
    });
  }

  private extractIpAddress(req?: Request): string | null {
    const forwardedFor = req?.headers['x-forwarded-for'];

    if (Array.isArray(forwardedFor)) {
      return forwardedFor[0]?.split(',')[0]?.trim() || null;
    }

    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0]?.trim() || null;
    }

    return req?.ip || req?.socket?.remoteAddress || null;
  }

  private buildAuthLogContext(email: string, req?: Request) {
    if (!req) {
      return { email, requestId: null, origin: null, userAgent: null };
    }

    const context = buildHttpLogContext(req);
    return {
      email,
      requestId: context.requestId,
      origin: context.origin,
      userAgent: context.userAgent,
    };
  }

  private identifierFingerprint(identifier: string): string {
    return `sha256:${createHash('sha256').update(identifier.trim().toLowerCase()).digest('hex')}`;
  }

  private requestId(req?: Request): string | null {
    return (req as (Request & { requestId?: string }) | undefined)?.requestId ?? null;
  }
}
