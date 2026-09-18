import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrganizationMembershipStatus,
  OrganizationOnboardingStatus,
  OrganizationStatus,
  Prisma,
} from '@prisma/client';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { getCurrentOrganizationId } from '../common/tenant/tenant-scope.util';
import type { PlatformScopeContext } from '../common/tenant/tenant-context.types';
import { PrismaService, TenantTransactionClient } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { FindOrganizationsDto } from './dto/find-organizations.dto';
import { ProvisionOrganizationDto } from './dto/provision-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

const LIFECYCLE_TRANSITIONS: Readonly<Record<OrganizationStatus, readonly OrganizationStatus[]>> = {
  PENDING_SETUP: [OrganizationStatus.ACTIVE, OrganizationStatus.ARCHIVED],
  ACTIVE: [OrganizationStatus.SUSPENDED, OrganizationStatus.ARCHIVED],
  SUSPENDED: [OrganizationStatus.ACTIVE, OrganizationStatus.ARCHIVED],
  ARCHIVED: [],
};

const organizationSelect = {
  id: true,
  code: true,
  name: true,
  status: true,
  onboardingStatus: true,
  onboardingStartedAt: true,
  onboardingCompletedAt: true,
  onboardingLastAttemptAt: true,
  onboardingFailureCode: true,
  onboardingFailureMessage: true,
  timezone: true,
  locale: true,
  settings: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async current(user: CurrentUserPayload) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: getCurrentOrganizationId(user) },
      select: organizationSelect,
    });
    if (!organization) throw new NotFoundException('Organization not found');
    return organization;
  }

  async findAll(query: FindOrganizationsDto, platform: PlatformScopeContext) {
    void platform;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const where: Prisma.OrganizationWhereInput = {
      ...(query.status && { status: query.status }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' as const } },
          { name: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        select: organizationSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.organization.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return { data, meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 } };
  }

  async findOne(id: string, platform: PlatformScopeContext) {
    void platform;
    const organization = await this.prisma.organization.findUnique({ where: { id }, select: organizationSelect });
    if (!organization) throw new NotFoundException('Organization not found');
    return organization;
  }

  async onboarding(id: string, platform: PlatformScopeContext) {
    const organization = await this.findOne(id, platform);
    const [owners, teams] = await Promise.all([
      this.prisma.organizationMembership.count({
        where: { organizationId: id, isTenantOwner: true, status: OrganizationMembershipStatus.ACTIVE, user: { isActive: true } },
      }),
      this.prisma.team.count({ where: { organizationId: id, isActive: true } }),
    ]);
    return { organization, readiness: { activeTenantOwners: owners, activeTeams: teams, ready: organization.onboardingStatus === OrganizationOnboardingStatus.READY && owners > 0 && teams > 0 } };
  }

  async create(dto: CreateOrganizationDto, platform: PlatformScopeContext) {
    const code = this.normalizeCode(dto.code);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            code,
            name: this.requiredText(dto.name, 'Organization name is required'),
            status: OrganizationStatus.PENDING_SETUP,
            onboardingStatus: OrganizationOnboardingStatus.NOT_STARTED,
            timezone: dto.timezone?.trim() || 'Asia/Tehran',
            locale: dto.locale?.trim() || 'fa-IR',
            settings: dto.settings as Prisma.InputJsonValue | undefined,
          },
          select: organizationSelect,
        });
        await this.audit(tx, platform, organization.id, 'TENANT_CREATED', null, organization);
        return organization;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Organization code already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateOrganizationDto, platform: PlatformScopeContext) {
    const current = await this.findOne(id, platform);
    const data: Prisma.OrganizationUpdateInput = {};
    if (dto.code !== undefined) data.code = this.normalizeCode(dto.code);
    if (dto.name !== undefined) data.name = this.requiredText(dto.name, 'Organization name is required');
    if (dto.timezone !== undefined) data.timezone = dto.timezone.trim() || 'Asia/Tehran';
    if (dto.locale !== undefined) data.locale = dto.locale.trim() || 'fa-IR';
    if (dto.settings !== undefined) data.settings = dto.settings as Prisma.InputJsonValue;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.organization.update({ where: { id }, data, select: organizationSelect });
        await this.audit(tx, platform, id, 'organization.updated', current, updated);
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Organization code already exists');
      }
      throw error;
    }
  }

  async provision(id: string, dto: ProvisionOrganizationDto, platform: PlatformScopeContext) {
    const attemptAt = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, id);
        const organization = await this.requiredOrganization(tx, id);
        if (organization.status !== OrganizationStatus.PENDING_SETUP) {
          throw new ConflictException('Only a pending Organization can be provisioned');
        }
        const owner = await tx.user.findUnique({ where: { id: dto.ownerUserId }, select: { id: true, isActive: true } });
        if (!owner?.isActive) throw new BadRequestException('Tenant Owner must be an active User');
        await tx.organization.update({
          where: { id },
          data: {
            onboardingStatus: OrganizationOnboardingStatus.IN_PROGRESS,
            onboardingStartedAt: organization.onboardingStartedAt ?? attemptAt,
            onboardingLastAttemptAt: attemptAt,
            onboardingFailureCode: null,
            onboardingFailureMessage: null,
          },
        });
        await this.audit(tx, platform, id, 'TENANT_PROVISIONING_STARTED', organization, { onboardingStatus: 'IN_PROGRESS' });
        const teamCode = this.normalizeCode(dto.defaultTeamCode || 'default');
        const team = await tx.team.upsert({
          where: { organizationId_code: { organizationId: id, code: teamCode } },
          create: { organizationId: id, code: teamCode, name: this.requiredText(dto.defaultTeamName || 'Default Team', 'Default team name is required'), managerId: owner.id },
          update: {},
        });
        const membership = await tx.organizationMembership.upsert({
          where: { userId_organizationId: { userId: owner.id, organizationId: id } },
          create: { userId: owner.id, organizationId: id, teamId: team.id, status: OrganizationMembershipStatus.ACTIVE, isTenantOwner: true, joinedAt: attemptAt, isDefault: false },
          update: { status: OrganizationMembershipStatus.ACTIVE, isTenantOwner: true, joinedAt: attemptAt, teamId: team.id, suspendedAt: null },
        });
        const ready = await tx.organization.update({
          where: { id },
          data: { onboardingStatus: OrganizationOnboardingStatus.READY, onboardingCompletedAt: new Date(), onboardingFailureCode: null, onboardingFailureMessage: null },
          select: organizationSelect,
        });
        await this.audit(tx, platform, id, 'TENANT_OWNER_ASSIGNED', null, { membershipId: membership.id, ownerUserId: owner.id });
        await this.audit(tx, platform, id, 'TENANT_PROVISIONING_COMPLETED', { onboardingStatus: 'IN_PROGRESS' }, ready);
        return { organization: ready, ownerMembershipId: membership.id, defaultTeamId: team.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : 'Provisioning failed';
      await this.recordProvisioningFailure(id, platform, attemptAt, message);
      throw error;
    }
  }

  activate(id: string, platform: PlatformScopeContext) {
    return this.transition(id, OrganizationStatus.ACTIVE, 'TENANT_ACTIVATED', platform);
  }

  suspend(id: string, platform: PlatformScopeContext) {
    return this.transition(id, OrganizationStatus.SUSPENDED, 'TENANT_SUSPENDED', platform);
  }

  resume(id: string, platform: PlatformScopeContext) {
    return this.transition(id, OrganizationStatus.ACTIVE, 'TENANT_RESUMED', platform);
  }

  archive(id: string, platform: PlatformScopeContext) {
    return this.transition(id, OrganizationStatus.ARCHIVED, 'TENANT_ARCHIVED', platform);
  }

  private async transition(id: string, target: OrganizationStatus, action: string, platform: PlatformScopeContext) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const current = await this.requiredOrganization(tx, id);
      if (current.status === target) return current;
      if (!LIFECYCLE_TRANSITIONS[current.status].includes(target)) {
        throw new ConflictException(`Invalid Organization lifecycle transition: ${current.status} -> ${target}`);
      }
      if (target === OrganizationStatus.ACTIVE) await this.assertActivationReady(tx, current);
      const updated = await tx.organization.update({ where: { id }, data: { status: target }, select: organizationSelect });
      await this.audit(tx, platform, id, action, current, updated);
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async assertActivationReady(tx: TenantTransactionClient, organization: { id: string; onboardingStatus: OrganizationOnboardingStatus }) {
    if (organization.onboardingStatus !== OrganizationOnboardingStatus.READY) {
      throw new ConflictException('Organization onboarding is not ready');
    }
    const owners = await tx.organizationMembership.count({
      where: { organizationId: organization.id, isTenantOwner: true, status: OrganizationMembershipStatus.ACTIVE, user: { isActive: true } },
    });
    if (owners < 1) throw new ConflictException('An active Tenant Owner is required');
  }

  private requiredOrganization(tx: TenantTransactionClient, id: string) {
    return tx.organization.findUnique({ where: { id }, select: organizationSelect }).then((row) => {
      if (!row) throw new NotFoundException('Organization not found');
      return row;
    });
  }

  private async lock(tx: TenantTransactionClient, id: string) {
    await tx.$queryRaw<Array<{ lockResult: string | null }>>(Prisma.sql`
      SELECT CAST(pg_advisory_xact_lock(hashtext(${id})) AS TEXT) AS "lockResult"
    `);
  }

  private async audit(tx: TenantTransactionClient, platform: PlatformScopeContext, organizationId: string, action: string, before: unknown, after: unknown) {
    await tx.auditLog.create({
      data: {
        actorId: platform.userId,
        actorType: 'PLATFORM_ADMIN',
        scope: 'PLATFORM',
        source: 'PLATFORM',
        result: 'SUCCESS',
        organizationId: null,
        entityType: 'organization',
        entityId: organizationId,
        action,
        before: this.json(before),
        after: this.json(after),
        requestId: platform.requestId ?? null,
        metadata: { platformRole: platform.platformRole, targetOrganizationId: organizationId },
      },
    });
  }

  private async recordProvisioningFailure(id: string, platform: PlatformScopeContext, attemptAt: Date, message: string) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, id);
        const organization = await tx.organization.findUnique({ where: { id }, select: { status: true } });
        if (!organization || organization.status !== OrganizationStatus.PENDING_SETUP) return;
        await tx.organization.update({ where: { id }, data: { onboardingStatus: OrganizationOnboardingStatus.FAILED, onboardingLastAttemptAt: attemptAt, onboardingFailureCode: 'PROVISIONING_FAILED', onboardingFailureMessage: message } });
        await this.audit(tx, platform, id, 'TENANT_PROVISIONING_FAILED', null, { failureCode: 'PROVISIONING_FAILED' });
      });
    } catch {
      // Preserve the original provisioning failure; validation tooling reports an unaudited failure.
    }
  }

  private json(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === null || value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private normalizeCode(code: string) {
    const normalized = code.trim().toLowerCase();
    if (!normalized) throw new BadRequestException('Organization code is required');
    return normalized;
  }

  private requiredText(value: string, message: string) {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(message);
    return normalized;
  }
}
