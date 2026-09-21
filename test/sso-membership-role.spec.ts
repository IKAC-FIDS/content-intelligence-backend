import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { RoleScope, SsoProviderType, UserRole } from '@prisma/client';
import { OidcService } from '../src/auth/sso/oidc.service';
import { SamlService } from '../src/auth/sso/saml.service';
import { resolveSsoMappedRole } from '../src/auth/sso/sso-membership-role';
import { SsoExchangeController } from '../src/auth/sso/sso-exchange.controller';

const provider = (type: SsoProviderType, overrides: Record<string, unknown> = {}) => ({
  id: 'provider-a', organizationId: 'org-a', type, isActive: true, autoProvision: true,
  defaultRole: UserRole.ADMIN, allowedDomains: ['example.test'], groupsAttribute: 'groups',
  ...overrides,
}) as any;
const identity = { subject: 'subject-a', email: 'user@example.test', fullName: 'User', groups: ['engineering'] };
const role = (scope: RoleScope) => ({ id: scope === RoleScope.SYSTEM ? 'system-role' : 'tenant-role', baseRole: UserRole.MANAGER, scope, organizationId: scope === RoleScope.SYSTEM ? null : 'org-a', isActive: true });

function oidcHarness(mappedRole: any, membership: any = null, existingUser: any = null) {
  const tx: any = {
    ssoGroupRoleMapping: { findMany: jest.fn().mockResolvedValue(mappedRole ? [{ roleId: mappedRole.id }] : []) },
    role: { findFirst: jest.fn().mockResolvedValue(mappedRole) },
    externalIdentity: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
    user: {
      findUnique: jest.fn().mockResolvedValue(existingUser),
      create: jest.fn().mockResolvedValue({ id: 'user-a', isActive: true }),
    },
    organizationMembership: {
      findUnique: jest.fn().mockResolvedValue(membership),
      create: jest.fn().mockResolvedValue({ id: 'membership-a' }),
      update: jest.fn().mockResolvedValue({ id: membership?.id ?? 'membership-a' }),
    },
  };
  const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
  const service = new OidcService(prisma, {} as any, {} as any, {} as any, { record: jest.fn() } as any, {} as any);
  return { tx, service };
}

function samlHarness(mappedRole: any, membership: any = null, existingUser: any = null) {
  const tx: any = {
    user: { create: jest.fn().mockResolvedValue({ id: 'user-a', isActive: true }) },
    organizationMembership: { create: jest.fn().mockResolvedValue({ id: 'membership-a' }) },
    externalIdentity: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    ssoGroupRoleMapping: { findMany: jest.fn().mockResolvedValue(mappedRole ? [{ roleId: mappedRole.id }] : []) },
    role: { findFirst: jest.fn().mockResolvedValue(mappedRole) },
    externalIdentity: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn().mockResolvedValue(existingUser) },
    organizationMembership: {
      findUnique: jest.fn().mockResolvedValue(membership),
      create: jest.fn().mockResolvedValue({ id: 'membership-a' }),
      update: jest.fn().mockResolvedValue({ id: membership?.id ?? 'membership-a' }),
    },
    $transaction: jest.fn((callback) => callback(tx)),
  };
  const service = new SamlService(prisma, {} as any, {} as any, { record: jest.fn() } as any);
  return { tx, prisma, service };
}

describe('Stage 5.4-D SSO membership role authority', () => {
  it.each([RoleScope.SYSTEM, RoleScope.TENANT])('creates a new OIDC membership with the mapped %s Role.id', async (scope) => {
    const mapped = role(scope);
    const { tx, service } = oidcHarness(mapped);
    await (service as any).resolveIdentity(provider(SsoProviderType.OIDC), identity);
    expect(tx.organizationMembership.create).toHaveBeenCalledWith({ data: expect.objectContaining({ roleId: mapped.id, status: 'ACTIVE' }) });
  });

  it.each([RoleScope.SYSTEM, RoleScope.TENANT])('creates a new SAML membership with the mapped %s Role.id', async (scope) => {
    const mapped = role(scope);
    const { tx, service } = samlHarness(mapped);
    await (service as any).resolveUser(provider(SsoProviderType.SAML), identity);
    expect(tx.organizationMembership.create).toHaveBeenCalledWith({ data: expect.objectContaining({ roleId: mapped.id, status: 'ACTIVE' }) });
  });

  it('does not create an ACTIVE null-role membership when no group maps', async () => {
    const { tx, service } = oidcHarness(null);
    await expect((service as any).resolveIdentity(provider(SsoProviderType.OIDC), identity)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tx.organizationMembership.create).not.toHaveBeenCalled();
  });

  it('fails closed for multiple distinct mapped roles', async () => {
    const db: any = { ssoGroupRoleMapping: { findMany: jest.fn().mockResolvedValue([{ roleId: 'a' }, { roleId: 'b' }]) }, role: { findFirst: jest.fn() } };
    await expect(resolveSsoMappedRole(db, 'provider-a', 'org-a', ['one', 'two'])).rejects.toThrow('Conflicting SSO group mappings');
  });

  it.each(['inactive', 'cross-tenant'])('fails closed for an %s mapped role', async () => {
    const db: any = { ssoGroupRoleMapping: { findMany: jest.fn().mockResolvedValue([{ roleId: 'invalid' }]) }, role: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(resolveSsoMappedRole(db, 'provider-a', 'org-a', ['engineering'])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves existing valid Role A when the current OIDC group maps to Role B', async () => {
    const membership = { id: 'membership-a', status: 'ACTIVE', roleId: 'role-a', role: { isActive: true, scope: RoleScope.TENANT, organizationId: 'org-a' } };
    const { tx, service } = oidcHarness(role(RoleScope.SYSTEM), membership, { id: 'user-a', isActive: true });
    await (service as any).resolveIdentity(provider(SsoProviderType.OIDC), identity);
    expect(tx.organizationMembership.update).not.toHaveBeenCalled();
  });

  it('repairs an existing null-role SAML membership from one valid mapping', async () => {
    const mapped = role(RoleScope.TENANT);
    const membership = { id: 'membership-a', status: 'ACTIVE', roleId: null, role: null };
    const { prisma, service } = samlHarness(mapped, membership, { id: 'user-a', isActive: true });
    await (service as any).resolveUser(provider(SsoProviderType.SAML), identity);
    expect(prisma.organizationMembership.update).toHaveBeenCalledWith({ where: { id: 'membership-a' }, data: { roleId: mapped.id } });
  });

  it('does not create a missing SAML membership when autoProvision is false', async () => {
    const mapped = role(RoleScope.SYSTEM);
    const { prisma, service } = samlHarness(mapped, null, { id: 'user-a', isActive: true });
    await expect((service as any).resolveUser(provider(SsoProviderType.SAML, { autoProvision: false }), identity)).rejects.toThrow('membership is inactive or missing');
    expect(prisma.organizationMembership.create).not.toHaveBeenCalled();
  });

  it('uses the mapped Role.id without writing defaultRole or a legacy User role', async () => {
    const mapped = role(RoleScope.TENANT);
    const { tx, service } = samlHarness(mapped);
    await (service as any).resolveUser(provider(SsoProviderType.SAML, { defaultRole: UserRole.ADMIN }), identity);
    expect(tx.user.create.mock.calls[0][0].data).not.toHaveProperty('role');
    expect(tx.user.create.mock.calls[0][0].data).not.toHaveProperty('roleId');
    expect(tx.organizationMembership.create).toHaveBeenCalledWith({ data: expect.objectContaining({ roleId: mapped.id }) });
  });

  it('reconstructs authority through TenantResolver before issuing an SSO session', async () => {
    const tickets: any = { consumeTicket: jest.fn().mockResolvedValue({ userId: 'user-a', providerId: 'provider-a' }) };
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-a', isActive: true }) },
      ssoProvider: { findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-a', isActive: true, organization: { status: 'ACTIVE' } }) },
    };
    const tenant = { organizationId: 'org-a', roleId: 'role-a', permissions: ['thing:read'] };
    const resolver: any = { selectTenant: jest.fn().mockResolvedValue(tenant) };
    const auth: any = {
      buildSessionLoginResponse: jest.fn().mockResolvedValue({ refreshToken: 'token', refreshTokenMaxAgeMs: 1000 }),
      toPublicAuthResponse: jest.fn().mockReturnValue({ accessToken: 'access' }),
    };
    const response: any = { cookie: jest.fn() };
    const controller = new SsoExchangeController(tickets, prisma, auth, resolver);
    await controller.exchange({ ticket: 'ticket' }, {} as any, response);
    expect(resolver.selectTenant).toHaveBeenCalledWith('user-a', 'org-a');
    expect(auth.buildSessionLoginResponse).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-a' }), expect.anything(), tenant);
  });
});
