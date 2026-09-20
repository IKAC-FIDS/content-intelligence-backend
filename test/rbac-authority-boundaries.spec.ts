import { Global, Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { AdminPermissionsController } from '../src/admin/admin-permissions.controller';
import { AdminPermissionsService } from '../src/admin/admin-permissions.service';
import { AdminPermissionsModule } from '../src/admin/admin-permissions.module';
import { PermissionsManagementController, RolesManagementController, PlatformRolesManagementController } from '../src/admin/rbac-management.controller';
import { RbacManagementService } from '../src/admin/rbac-management.service';
import { TenantRolesController as LegacyTenantRolesController } from '../src/admin/tenant-roles.controller';
import { TenantRolesService } from '../src/admin/tenant-roles.service';
import { TenantRolesController, TenantMembershipRolesController } from '../src/organization-memberships/tenant-rbac.controller';
import { TenantRbacService } from '../src/organization-memberships/tenant-rbac.service';
import { OrganizationMembershipsModule } from '../src/organization-memberships/organization-memberships.module';
import { PlatformAuthorityModule } from '../src/platform-authority/platform-authority.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditLogService } from '../src/audit-log/audit-log.service';
import { AuditRequestContextService } from '../src/audit-log/audit-request-context.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { TenantResolverService } from '../src/organization-memberships/tenant-resolver.service';

// Real HTTP controllers, services, JWT strategies and guards; synthetic persistence only.
describe('Stage 5.4-A RBAC authority boundaries', () => {
  let app: INestApplication;
  const permissionId = '10000000-0000-4000-8000-000000000001';
  const systemId = '20000000-0000-4000-8000-000000000001';
  const ownId = '20000000-0000-4000-8000-000000000002';
  const foreignId = '20000000-0000-4000-8000-000000000003';
  const roles = new Map<string, any>();
  const permissions = new Map<string, any>();
  const grants: any[] = [];
  const versions = new Map<string, number>();
  const memberships = new Map<string, any>();
  const users: Record<string, any> = {
    'tenant-admin': { id: 'tenant-admin', email: 'tenant@example.test', role: 'ADMIN', roleId: null, isActive: true },
    'tenant-reader': { id: 'tenant-reader', email: 'reader@example.test', role: 'REP', roleId: null, isActive: true },
    'platform-admin': { id: 'platform-admin', email: 'platform@example.test', role: 'REP', roleId: null, isActive: true },
  };
  let platformGranted = true;
  const config = new ConfigService({ JWT_SECRET: 'synthetic-rbac-test-secret-at-least-32-characters' });
  const jwt = new JwtService({ secret: config.get('JWT_SECRET') });
  const matches = (row: any, where: any): boolean => Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (value === undefined) return true;
    if (key === 'OR') return value.some((clause: any) => matches(row, clause));
    if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key]);
    return row[key] === value;
  });
  const hydrate = (row: any) => row ? {
    ...row,
    permissions: grants.filter(g => g.roleId === row.id).map(g => ({ ...g, permission: permissions.get(g.permissionId) })),
    _count: { users: 0, permissions: grants.filter(g => g.roleId === row.id).length, organizationMemberships: 0 },
  } : null;
  const prisma: any = {
    user: { findUnique: jest.fn(async ({ where }) => users[where.id] ?? null) },
    platformAuthority: { findUnique: jest.fn(async ({ where }) =>
      where.userId === 'platform-admin' && platformGranted
        ? { role: 'PLATFORM_ADMIN', user: { isActive: users['platform-admin'].isActive } }
        : null) },
    role: {
      findFirst: jest.fn(async ({ where }) => hydrate([...roles.values()].find(row => matches(row, where)))),
      findMany: jest.fn(async ({ where }) => [...roles.values()].filter(row => matches(row, where)).map(hydrate)),
      update: jest.fn(async ({ where, data }) => {
        const row = [...roles.values()].find(row => matches(row, where));
        if (!row) throw new Error('Role not found');
        Object.assign(row, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
        return hydrate(row);
      }),
      delete: jest.fn(async ({ where }) => { const row = roles.get(where.id); roles.delete(where.id); return row; }),
    },
    permission: {
      findUnique: jest.fn(async ({ where }) => [...permissions.values()].find(row => matches(row, where)) ?? null),
      findMany: jest.fn(async ({ where }) => [...permissions.values()].filter(row => matches(row, where))),
      create: jest.fn(async ({ data }) => { const row = { id: 'created-permission', isSystem: false, isActive: true, ...data }; permissions.set(row.id, row); return row; }),
      update: jest.fn(async ({ where, data }) => { const row = permissions.get(where.id); Object.assign(row, data); return row; }),
      delete: jest.fn(async ({ where }) => { const row = permissions.get(where.id); permissions.delete(where.id); return row; }),
    },
    rolePermission: {
      count: jest.fn(async ({ where }) => grants.filter(row => matches(row, where)).length),
      deleteMany: jest.fn(async ({ where }) => {
        const retained = grants.filter(row => !matches(row, where)); const count = grants.length - retained.length;
        grants.splice(0, grants.length, ...retained); return { count };
      }),
      createMany: jest.fn(async ({ data }) => { grants.push(...data); return { count: data.length }; }),
    },
    organization: {
      update: jest.fn(async ({ where }) => { versions.set(where.id, versions.get(where.id)! + 1); return { id: where.id }; }),
      updateMany: jest.fn(async () => { for (const id of versions.keys()) versions.set(id, versions.get(id)! + 1); return { count: versions.size }; }),
    },
    organizationMembership: {
      findFirst: jest.fn(async ({ where }) => [...memberships.values()].find(row => matches(row, where)) ?? null),
      count: jest.fn(async () => 0),
      update: jest.fn(async ({ where, data }) => { const row = memberships.get(where.id); Object.assign(row, data); return row; }),
    },
    auditLog: { create: jest.fn(async ({ data }) => data) },
  };
  prisma.$transaction = async (callback: any) => callback(prisma);
  const resolver = {
    resolveAuthenticatedTenant: jest.fn(async (id: string) => {
      if (id === 'platform-admin') throw new Error('No tenant membership');
      return {
        tenantId: 'org-a', organizationId: 'org-a', userId: id, membershipId: 'actor-membership',
        role: users[id].role, roleId: ownId, tenantRole: users[id].role,
        permissions: id === 'tenant-admin' ? ['role:manage', 'role:view', 'permission:manage', 'permission:view'] : ['role:view', 'permission:view'],
        platformAdmin: false, membershipStatus: 'active', resolutionSource: 'token-session',
      };
    }),
  };

  @Global()
  @Module({ providers: [
    { provide: PrismaService, useValue: prisma },
    { provide: ConfigService, useValue: config },
    { provide: AuditLogService, useValue: { record: jest.fn(async () => undefined) } },
  ], exports: [PrismaService, ConfigService, AuditLogService] })
  class PersistenceModule {}

  @Module({
    imports: [PersistenceModule, PassportModule, PlatformAuthorityModule],
    controllers: [PermissionsManagementController, RolesManagementController, PlatformRolesManagementController,
      AdminPermissionsController, LegacyTenantRolesController, TenantRolesController, TenantMembershipRolesController],
    providers: [RbacManagementService, AdminPermissionsService, TenantRolesService, TenantRbacService, JwtStrategy,
      { provide: TenantResolverService, useValue: resolver },
      { provide: AuditRequestContextService, useValue: { setOrganizationId() {}, setActor() {} } }],
  })
  class TestModule {}

  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => {
    roles.clear(); permissions.clear(); grants.splice(0); versions.clear(); memberships.clear();
    versions.set('org-a', 1); versions.set('org-b', 1);
    for (const [id, scope, organizationId] of [[systemId, 'SYSTEM', null], [ownId, 'TENANT', 'org-a'], [foreignId, 'TENANT', 'org-b']]) {
      roles.set(id!, { id, scope, organizationId, code: id === systemId ? 'MANAGER' : id, baseRole: 'MANAGER', name: 'Existing role', isSystem: scope === 'SYSTEM', isActive: true });
    }
    permissions.set(permissionId, { id: permissionId, action: 'content:view', isSystem: false, isActive: true });
    memberships.set('own-membership', { id: 'own-membership', organizationId: 'org-a', roleId: ownId });
    memberships.set('foreign-membership', { id: 'foreign-membership', organizationId: 'org-b', roleId: foreignId });
    platformGranted = true; users['platform-admin'].isActive = true;
    jest.clearAllMocks();
  });
  const call = (method: string, path: string, actor = 'tenant-admin', body?: any) =>
    (request(app.getHttpServer()) as any)[method](path)
      .set('Authorization', 'Bearer ' + jwt.sign({ sub: actor, email: users[actor].email, role: users[actor].role }))
      .send(body);

  it('wires the existing authority and canonical tenant service modules into production RBAC', () => {
    const imports = Reflect.getMetadata('imports', AdminPermissionsModule);
    expect(imports).toContain(PlatformAuthorityModule);
    expect(imports).toContain(OrganizationMembershipsModule);
    expect(Reflect.getMetadata('controllers', AdminPermissionsModule)).toContain(PlatformRolesManagementController);
  });

  it.each([
    ['post', '/permissions', { action: 'content:manage' }],
    ['patch', '/permissions/' + permissionId, { name: 'Changed' }],
    ['delete', '/permissions/' + permissionId, undefined],
    ['post', '/admin/permissions/create', { action: 'content:manage' }],
    ['delete', '/admin/permissions/content:view', undefined],
    ['post', '/admin/permissions/assign', { role: 'ADMIN', action: 'content:view' }],
    ['delete', '/admin/permissions/revoke', { role: 'ADMIN', action: 'content:view' }],
    ['post', '/admin/permissions/bulk-assign', { role: 'ADMIN', actions: ['content:view'] }],
    ['post', '/admin/permissions/bulk-revoke', { role: 'ADMIN', actions: ['content:view'] }],
    ['patch', '/platform/roles/' + systemId, { name: 'Changed' }],
    ['put', '/platform/roles/' + systemId + '/permissions', { permissionIds: [permissionId] }],
    ['delete', '/platform/roles/' + systemId, undefined],
  ])('denies tenant ADMIN global mutation: %s %s', async (method, path, body) => {
    await call(method as string, path as string, 'tenant-admin', body).expect(403);
    expect(prisma.permission.create).not.toHaveBeenCalled();
    expect(prisma.permission.update).not.toHaveBeenCalled();
    expect(prisma.permission.delete).not.toHaveBeenCalled();
    expect(prisma.role.update).not.toHaveBeenCalled();
    expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('allows a persisted PLATFORM_ADMIN without tenant membership or ADMIN enum to manage the catalog', async () => {
    await call('post', '/permissions', 'platform-admin', { action: 'content:manage' }).expect(201);
    await call('patch', '/permissions/' + permissionId, 'platform-admin', { name: 'Changed' }).expect(200);
    await call('delete', '/permissions/' + permissionId, 'platform-admin').expect(200);
    expect(resolver.resolveAuthenticatedTenant).not.toHaveBeenCalled();
  });

  it('allows platform-only access to the legacy global catalog API', async () => {
    await call('get', '/admin/permissions', 'platform-admin').expect(200);
    await call('post', '/admin/permissions/create', 'platform-admin', { action: 'source:view' }).expect(201);
  });

  it('allows platform-only SYSTEM metadata and grant changes and versions all tenants', async () => {
    await call('patch', '/platform/roles/' + systemId, 'platform-admin', { name: 'Platform managed' }).expect(200);
    await call('put', '/platform/roles/' + systemId + '/permissions', 'platform-admin', { permissionIds: [permissionId] }).expect(200);
    expect(roles.get(systemId).name).toBe('Platform managed');
    expect(grants).toEqual([{ roleId: systemId, role: 'MANAGER', permissionId }]);
    expect(versions.get('org-a')).toBe(3);
    expect(versions.get('org-b')).toBe(3);
    expect(resolver.resolveAuthenticatedTenant).not.toHaveBeenCalled();
  });

  it('rejects tenant-role targets through the platform SYSTEM API', async () => {
    await call('patch', '/platform/roles/' + ownId, 'platform-admin', { name: 'Wrong scope' }).expect(404);
    await call('put', '/platform/roles/' + ownId + '/permissions', 'platform-admin', { permissionIds: [permissionId] }).expect(404);
    expect(prisma.role.update).not.toHaveBeenCalled();
    expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('rechecks persisted platform authority and rejects revocation and inactive accounts', async () => {
    platformGranted = false;
    await call('post', '/permissions', 'platform-admin', { action: 'content:manage' }).expect(403);
    platformGranted = true; users['platform-admin'].isActive = false;
    await call('post', '/permissions', 'platform-admin', { action: 'content:manage' }).expect(401);
    expect(prisma.permission.create).not.toHaveBeenCalled();
  });

  describe.each(['/roles', '/organization/roles', '/tenant/roles'])('%s tenant role route', (prefix) => {
    it('denies mutation of SYSTEM role metadata and permissions', async () => {
      const status = prefix === '/tenant/roles' ? 404 : 403;
      await call('patch', prefix + '/' + systemId, 'tenant-admin', { name: 'Not allowed' }).expect(status);
      await call('put', prefix + '/' + systemId + '/permissions', 'tenant-admin', { permissionIds: [permissionId] }).expect(status);
      expect(prisma.role.update).not.toHaveBeenCalled();
      expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
    });
    it('denies Tenant A mutation of Tenant B role metadata and permissions', async () => {
      await call('patch', prefix + '/' + foreignId, 'tenant-admin', { name: 'Not allowed' }).expect(404);
      await call('put', prefix + '/' + foreignId + '/permissions', 'tenant-admin', { permissionIds: [permissionId] }).expect(404);
      expect(prisma.role.update).not.toHaveBeenCalled();
      expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
    });
    it('allows own-tenant metadata and permissions with version increments only for that tenant', async () => {
      await call('patch', prefix + '/' + ownId, 'tenant-admin', { name: 'Tenant managed' }).expect(200);
      await call('put', prefix + '/' + ownId + '/permissions', 'tenant-admin', { permissionIds: [permissionId] }).expect(200);
      expect(roles.get(ownId).name).toBe('Tenant managed');
      expect(grants).toEqual([{ roleId: ownId, permissionId }]);
      expect(versions.get('org-a')).toBe(3); expect(versions.get('org-b')).toBe(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org-a', action: 'tenant-role.permissions-replaced' }),
      }));
    });
    it('denies own-tenant mutation without role:manage', async () => {
      await call('patch', prefix + '/' + ownId, 'tenant-reader', { name: 'Not allowed' }).expect(403);
      await call('put', prefix + '/' + ownId + '/permissions', 'tenant-reader', { permissionIds: [permissionId] }).expect(403);
      expect(prisma.role.update).not.toHaveBeenCalled();
      expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
    });
    it('scopes reads to own tenant plus SYSTEM roles', async () => {
      const response = await call('get', prefix).expect(200);
      expect(response.body.map((row: any) => row.id).sort()).toEqual([systemId, ownId].sort());
      await call('get', prefix + '/' + foreignId).expect(404);
    });
  });

  it.each(['/roles', '/organization/roles'])('protects legacy deletion at %s', async prefix => {
    await call('delete', prefix + '/' + systemId).expect(403);
    await call('delete', prefix + '/' + foreignId).expect(404);
    expect(prisma.role.delete).not.toHaveBeenCalled();
    await call('delete', prefix + '/' + ownId).expect(200);
    expect(prisma.role.delete).toHaveBeenCalledWith({ where: { id: ownId, scope: 'TENANT', organizationId: 'org-a' } });
  });

  it('preserves tenant permission catalog reads', async () => {
    await call('get', '/permissions').expect(200);
    await call('get', '/permissions/' + permissionId).expect(200);
  });

  it('scopes membership role assignment to the active tenant', async () => {
    await call('put', '/tenant/memberships/foreign-membership/role', 'tenant-admin', { roleId: ownId }).expect(404);
    await call('put', '/tenant/memberships/own-membership/role', 'tenant-admin', { roleId: foreignId }).expect(404);
    await call('put', '/tenant/memberships/own-membership/role', 'tenant-admin', { roleId: systemId }).expect(200);
    expect(memberships.get('own-membership').roleId).toBe(systemId);
    expect(versions.get('org-a')).toBe(2); expect(versions.get('org-b')).toBe(1);
    expect(prisma.platformAuthority.findUnique).not.toHaveBeenCalled();
  });
});
