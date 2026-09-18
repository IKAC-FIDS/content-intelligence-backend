import { ConflictException } from '@nestjs/common';
import {
  OrganizationMembershipStatus,
  OrganizationOnboardingStatus,
  OrganizationStatus,
  PlatformRole,
} from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PlatformOrganizationsController } from '../src/organizations/platform-organizations.controller';
import { OrganizationsService } from '../src/organizations/organizations.service';
import { PlatformAdminGuard } from '../src/platform-authority/platform-admin.guard';

const platform = {
  userId: 'platform-user',
  platformAdmin: true as const,
  platformRole: PlatformRole.PLATFORM_ADMIN,
  requestId: 'request-89',
};

const organization = (overrides: Record<string, unknown> = {}) => ({
  id: 'org-a',
  code: 'org-a',
  name: 'Organization A',
  status: OrganizationStatus.PENDING_SETUP,
  onboardingStatus: OrganizationOnboardingStatus.NOT_STARTED,
  onboardingStartedAt: null,
  onboardingCompletedAt: null,
  onboardingLastAttemptAt: null,
  onboardingFailureCode: null,
  onboardingFailureMessage: null,
  timezone: 'Asia/Tehran',
  locale: 'fa-IR',
  settings: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('fix 000089 Organization lifecycle and onboarding', () => {
  it('uses an additive migration without changing existing Organization state or guessing Owners', () => {
    const sql = readFileSync(
      join(process.cwd(), 'prisma/migrations/20260811190000_add_organization_lifecycle_onboarding/migration.sql'),
      'utf8',
    );
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'PENDING_SETUP'");
    expect(sql).toContain('"onboardingStatus"');
    expect(sql).toContain('"isTenantOwner" BOOLEAN NOT NULL DEFAULT false');
    expect(sql).not.toMatch(/UPDATE\s+"organizations"/i);
    expect(sql).not.toMatch(/UPDATE\s+"organization_memberships"/i);
  });

  it('keeps every lifecycle route behind the central Platform authority guard', () => {
    expect(Reflect.getMetadata('__guards__', PlatformOrganizationsController)).toContain(PlatformAdminGuard);
  });

  it('creates a new Tenant as non-operational PENDING_SETUP and audits atomically', async () => {
    const tx = {
      organization: { create: jest.fn().mockResolvedValue(organization()) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new OrganizationsService(prisma as any);
    await expect(service.create({ code: ' Org-A ', name: ' Organization A ' }, platform)).resolves.toMatchObject({ status: 'PENDING_SETUP' });
    expect(tx.organization.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ code: 'org-a', status: OrganizationStatus.PENDING_SETUP, onboardingStatus: OrganizationOnboardingStatus.NOT_STARTED }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'TENANT_CREATED', organizationId: null }) }));
  });

  it('provisions one Organization-specific Owner and default Team and finishes READY', async () => {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ lockResult: '' }]),
      organization: {
        findUnique: jest.fn().mockResolvedValue(organization()),
        update: jest.fn()
          .mockResolvedValueOnce(organization({ onboardingStatus: OrganizationOnboardingStatus.IN_PROGRESS }))
          .mockResolvedValueOnce(organization({ onboardingStatus: OrganizationOnboardingStatus.READY })),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'owner-1', isActive: true }) },
      team: { upsert: jest.fn().mockResolvedValue({ id: 'team-1' }) },
      organizationMembership: { upsert: jest.fn().mockResolvedValue({ id: 'membership-1' }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new OrganizationsService(prisma as any);
    await expect(service.provision('org-a', { ownerUserId: 'owner-1', defaultTeamCode: 'default', defaultTeamName: 'Default Team' }, platform)).resolves.toMatchObject({ ownerMembershipId: 'membership-1', defaultTeamId: 'team-1' });
    expect(tx.organizationMembership.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_organizationId: { userId: 'owner-1', organizationId: 'org-a' } },
      create: expect.objectContaining({ organizationId: 'org-a', isTenantOwner: true, status: OrganizationMembershipStatus.ACTIVE, isDefault: false }),
      update: expect.objectContaining({ isTenantOwner: true, status: OrganizationMembershipStatus.ACTIVE }),
    }));
    expect(tx.team.upsert).toHaveBeenCalledTimes(1);
  });

  it('requires READY onboarding and an active Owner before activation', async () => {
    const tx: any = {
      $queryRaw: jest.fn(),
      organization: { findUnique: jest.fn().mockResolvedValue(organization()), update: jest.fn() },
      organizationMembership: { count: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new OrganizationsService({ $transaction: (callback: any) => callback(tx) } as any);
    await expect(service.activate('org-a', platform)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.organization.update).not.toHaveBeenCalled();
  });

  it('activates READY, suspends, resumes, and archives using audited transitions', async () => {
    let current = organization({ onboardingStatus: OrganizationOnboardingStatus.READY });
    const tx: any = {
      $queryRaw: jest.fn(),
      organization: {
        findUnique: jest.fn(() => Promise.resolve(current)),
        update: jest.fn(({ data }: any) => { current = { ...current, ...data }; return Promise.resolve(current); }),
      },
      organizationMembership: { count: jest.fn().mockResolvedValue(1) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new OrganizationsService({ $transaction: (callback: any) => callback(tx) } as any);
    await service.activate('org-a', platform);
    await service.suspend('org-a', platform);
    await service.resume('org-a', platform);
    await service.archive('org-a', platform);
    expect(current.status).toBe(OrganizationStatus.ARCHIVED);
    expect(tx.auditLog.create.mock.calls.map((call: any[]) => call[0].data.action)).toEqual([
      'TENANT_ACTIVATED', 'TENANT_SUSPENDED', 'TENANT_RESUMED', 'TENANT_ARCHIVED',
    ]);
  });

  it('treats an identical lifecycle retry as a no-op without duplicate audit', async () => {
    const current = organization({ status: OrganizationStatus.SUSPENDED, onboardingStatus: OrganizationOnboardingStatus.READY });
    const tx: any = { $queryRaw: jest.fn(), organization: { findUnique: jest.fn().mockResolvedValue(current) }, auditLog: { create: jest.fn() } };
    const service = new OrganizationsService({ $transaction: (callback: any) => callback(tx) } as any);
    await expect(service.suspend('org-a', platform)).resolves.toBe(current);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('makes ARCHIVED terminal and rejects PENDING_SETUP to SUSPENDED', async () => {
    const tx: any = { $queryRaw: jest.fn(), organization: { findUnique: jest.fn().mockResolvedValue(organization({ status: OrganizationStatus.ARCHIVED })) } };
    const service = new OrganizationsService({ $transaction: (callback: any) => callback(tx) } as any);
    await expect(service.resume('org-a', platform)).rejects.toBeInstanceOf(ConflictException);
    tx.organization.findUnique.mockResolvedValue(organization());
    await expect(service.suspend('org-a', platform)).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses a parameterized transaction advisory lock whose result is not void', () => {
    const source = readFileSync(join(process.cwd(), 'src/organizations/organizations.service.ts'), 'utf8');
    expect(source).toContain('pg_advisory_xact_lock(hashtext(${id}))');
    expect(source).toContain('CAST(pg_advisory_xact_lock');
    expect(source).toContain('AS "lockResult"');
    expect(source).not.toContain('$queryRawUnsafe');
  });

  it('does not let suspended or archived Organizations generate meeting reminders', () => {
    const source = readFileSync(join(process.cwd(), 'src/meetings/meeting-reminder.service.ts'), 'utf8');
    expect(source).toContain('organization: { status: OrganizationStatus.ACTIVE }');
  });
});
