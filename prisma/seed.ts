import { OrganizationMembershipStatus, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const DEFAULT_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

const permissions = [
  ['user:view', 'View tenant users'],
  ['user:create', 'Create tenant users'],
  ['user:update', 'Update tenant users'],
  ['user:manage', 'Manage tenant users'],
  ['user:activate', 'Activate tenant users'],
  ['user:deactivate', 'Deactivate tenant users'],
  ['user:change-role', 'Change tenant membership roles'],
  ['user:passkey:view', 'View user passkeys'],
  ['user:passkey:manage', 'Manage user passkeys'],
  ['permission:view', 'View permissions'],
  ['permission:manage', 'Manage role permissions'],
  ['role:view', 'View roles'],
  ['role:manage', 'Manage roles'],
  ['audit-log:view', 'View audit logs'],
  ['organization:view', 'View the current organization'],
  ['organization:manage', 'Manage organizations'],
  ['team:view', 'View teams'],
  ['team:manage', 'Manage teams'],
  ['sso-provider:view', 'View SSO providers'],
  ['sso-provider:manage', 'Manage SSO providers'],
  ['session:view', 'View sessions'],
  ['session:revoke', 'Revoke own sessions'],
  ['session:manage', 'Manage user sessions'],
] as const;

const rolePermissions: Record<UserRole, string[]> = {
  ADMIN: permissions.map(([action]) => action),
  MANAGER: [
    'user:view', 'user:create', 'user:update', 'user:manage',
    'user:activate', 'user:deactivate', 'user:change-role',
    'role:view', 'audit-log:view', 'organization:view',
    'team:view', 'team:manage', 'session:view', 'session:revoke',
  ],
  REP: ['user:view', 'organization:view', 'team:view', 'session:view', 'session:revoke'],
  BOARDS: ['user:view', 'organization:view', 'team:view', 'audit-log:view'],
};

async function syncSystemRole(role: UserRole) {
  const record = await prisma.role.upsert({
    where: { code: role },
    update: { name: role, baseRole: role, isSystem: true, isActive: true },
    create: { code: role, name: role, baseRole: role, isSystem: true, isActive: true },
  });

  for (const action of rolePermissions[role]) {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { action } });
    await prisma.rolePermission.upsert({
      where: { role_permissionId: { role, permissionId: permission.id } },
      update: { roleId: record.id },
      create: { role, roleId: record.id, permissionId: permission.id },
    });
  }
  return record;
}

async function main() {
  const organization = await prisma.organization.upsert({
    where: { code: 'default' },
    update: { name: 'Default Organization', status: 'ACTIVE' },
    create: {
      id: DEFAULT_ORGANIZATION_ID,
      code: 'default',
      name: 'Default Organization',
      status: 'ACTIVE',
      timezone: 'Asia/Tehran',
      locale: 'fa-IR',
    },
  });

  for (const [action, description] of permissions) {
    await prisma.permission.upsert({
      where: { action },
      update: { description, isSystem: true, isActive: true },
      create: { action, description, isSystem: true, isActive: true },
    });
  }

  const roles = new Map<UserRole, Awaited<ReturnType<typeof syncSystemRole>>>();
  for (const role of Object.values(UserRole)) roles.set(role, await syncSystemRole(role));

  await prisma.team.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: 'GENERAL',
      },
    },
    update: { name: 'General', isActive: true },
    create: {
      organizationId: organization.id,
      code: 'GENERAL',
      name: 'General',
    },
  });

  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    console.log('Foundation seed complete; SEED_ADMIN_PASSWORD was not set, so no default account was created.');
    return;
  }

  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@yourcompany.com').trim().toLowerCase();
  const adminRole = roles.get(UserRole.ADMIN)!;
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { fullName: 'Platform Administrator', isActive: true },
    create: {
      fullName: 'Platform Administrator',
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: UserRole.ADMIN,
      roleId: adminRole.id,
      organizationId: organization.id,
      isActive: true,
    },
  });
  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
    update: { roleId: adminRole.id, status: OrganizationMembershipStatus.ACTIVE, isDefault: true },
    create: {
      userId: user.id,
      organizationId: organization.id,
      roleId: adminRole.id,
      status: OrganizationMembershipStatus.ACTIVE,
      isDefault: true,
      isTenantOwner: true,
      joinedAt: new Date(),
    },
  });
  console.log(`Foundation seed complete; admin account ready: ${adminEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
