import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PlatformRole } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuthService } from '../src/auth/auth.service';
import { AuditLogService } from '../src/audit-log/audit-log.service';
import { PlatformOrganizationsController } from '../src/organizations/platform-organizations.controller';
import { OrganizationsController } from '../src/organizations/organizations.controller';
import { PlatformAdminGuard } from '../src/platform-authority/platform-admin.guard';
import { PlatformJwtStrategy } from '../src/platform-authority/platform-jwt.strategy';
import {
  grantPlatformAuthority,
  revokePlatformAuthority,
} from '../src/platform-authority/platform-authority-maintenance';

const executionContext = (request: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as any;

describe('fix 000088 Platform authority', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses an additive empty-safe migration with no automatic grants', () => {
    const sql = readFileSync(
      join(process.cwd(), 'prisma/migrations/20260811120000_add_platform_authority/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE "platform_authorities"');
    expect(sql).toContain('UNIQUE INDEX "platform_authorities_userId_key"');
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"platform_authorities"/i);
    expect(sql).not.toMatch(/UPDATE\s+"users"/i);
  });

  it('denies Tenant ADMIN and forged request flags without persisted authority', async () => {
    const prisma = { platformAuthority: { findUnique: jest.fn().mockResolvedValue(null) } };
    const guard = new PlatformAdminGuard(prisma as any);
    jest.spyOn(Object.getPrototypeOf(PlatformAdminGuard.prototype), 'canActivate').mockResolvedValue(true);
    const request = { user: { userId: 'tenant-admin', role: 'ADMIN' }, platformAdmin: true };
    await expect(guard.canActivate(executionContext(request))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('places only cross-Organization routes behind the central Platform guard', () => {
    const platformGuards = Reflect.getMetadata('__guards__', PlatformOrganizationsController);
    const tenantGuards = Reflect.getMetadata('__guards__', OrganizationsController);
    expect(platformGuards).toContain(PlatformAdminGuard);
    expect(tenantGuards).not.toContain(PlatformAdminGuard);
  });

  it('allows persisted active Platform Admin and creates trusted runtime context', async () => {
    const prisma = {
      platformAuthority: {
        findUnique: jest.fn().mockResolvedValue({ role: PlatformRole.PLATFORM_ADMIN, user: { isActive: true } }),
      },
    };
    const guard = new PlatformAdminGuard(prisma as any);
    jest.spyOn(Object.getPrototypeOf(PlatformAdminGuard.prototype), 'canActivate').mockResolvedValue(true);
    const request: any = { user: { userId: 'platform-user' }, requestId: 'request-1' };
    await expect(guard.canActivate(executionContext(request))).resolves.toBe(true);
    expect(request.platformContext).toEqual({
      userId: 'platform-user',
      platformAdmin: true,
      platformRole: 'PLATFORM_ADMIN',
      requestId: 'request-1',
    });
  });

  it('platform JWT authentication rejects forged or inactive identities', async () => {
    const config = { get: jest.fn().mockReturnValue('test-secret') };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'u@test', isActive: false }) } };
    const strategy = new PlatformJwtStrategy(config as any, prisma as any);
    await expect(strategy.validate({ sub: 'u1', email: 'u@test' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(strategy.validate({ sub: 'u1' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('grant and revoke are confirmed, idempotent, audited, and do not mutate Tenant membership', async () => {
    const state = { authority: false };
    const auditCreate = jest.fn();
    const tx: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'u@test', fullName: 'User', isActive: true }) },
      platformAuthority: {
        createMany: jest.fn(() => { const count = state.authority ? 0 : 1; state.authority = true; return Promise.resolve({ count }); }),
        findUniqueOrThrow: jest.fn(() => Promise.resolve({ userId: 'u1', role: PlatformRole.PLATFORM_ADMIN })),
        deleteMany: jest.fn(() => { const count = state.authority ? 1 : 0; state.authority = false; return Promise.resolve({ count }); }),
      },
      auditLog: { create: auditCreate },
    };
    const prisma: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ exists: true }]),
      $transaction: jest.fn((callback) => callback(tx)),
    };
    await expect(grantPlatformAuthority(prisma, 'u1', false)).rejects.toThrow('--confirm-apply');
    await expect(grantPlatformAuthority(prisma, 'u1', true)).resolves.toMatchObject({ status: 'granted' });
    await expect(grantPlatformAuthority(prisma, 'u1', true)).resolves.toMatchObject({ status: 'unchanged' });
    await expect(revokePlatformAuthority(prisma, 'u1', true)).resolves.toMatchObject({ status: 'revoked' });
    await expect(revokePlatformAuthority(prisma, 'u1', true)).resolves.toMatchObject({ status: 'unchanged' });
    expect(auditCreate).toHaveBeenCalledTimes(2);
    expect(tx).not.toHaveProperty('organizationMembership');
  });

  it('refresh/login fallback revalidates persisted authority and revoked authority fails', async () => {
    const service = Object.create(AuthService.prototype) as any;
    service.tenantResolver = { resolveAuthenticatedTenant: jest.fn().mockRejectedValue(new ForbiddenException()) };
    service.prisma = {
      platformAuthority: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ role: PlatformRole.PLATFORM_ADMIN, user: { isActive: true } })
          .mockResolvedValueOnce(null),
      },
    };
    await expect(service.resolveLoginContext('u1')).resolves.toBeNull();
    await expect(service.resolveLoginContext('u1', null, true)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('keeps explicit Platform audit scope null even inside a Tenant request context', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const audit = new AuditLogService(
      { auditLog: { create } } as any,
      { getContext: () => ({ organizationId: 'tenant-a', requestId: 'request-1' }) } as any,
      {} as any,
    );
    await audit.record({
      actorId: 'platform-user',
      organizationId: null,
      entityType: 'organization',
      action: 'organization.updated',
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: null, requestId: 'request-1' }),
    }));
  });
});
