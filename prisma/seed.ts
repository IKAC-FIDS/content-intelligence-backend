import {
  Prisma,
  PrismaClient,
  RoleScope,
  UserRole,
} from '@prisma/client';

export const FOUNDATION_PERMISSIONS = [
  ['user:view', 'View tenant users'],
  ['user:create', 'Create tenant users'],
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
] as const;

const ADMIN_ROLE = {
  code: UserRole.ADMIN,
  name: 'Tenant Administrator',
  baseRole: UserRole.ADMIN,
  scope: RoleScope.SYSTEM,
} as const;

type SeedClient = PrismaClient | Prisma.TransactionClient;

async function syncPermissions(prisma: SeedClient) {
  for (const [action, description] of FOUNDATION_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { action },
      update: { description, isSystem: true, isActive: true },
      create: { action, description, isSystem: true, isActive: true },
    });
  }
}

async function syncAdminRole(prisma: SeedClient) {
  const existing = await prisma.role.findUnique({
    where: { code: ADMIN_ROLE.code },
    select: {
      id: true,
      isSystem: true,
      scope: true,
      organizationId: true,
    },
  });

  if (
    existing &&
    (!existing.isSystem ||
      existing.scope !== RoleScope.SYSTEM ||
      existing.organizationId !== null)
  ) {
    throw new Error(
      'The reserved ADMIN role code is already used by a non-system role; resolve the conflict before seeding.',
    );
  }

  const role = await prisma.role.upsert({
    where: { code: ADMIN_ROLE.code },
    update: {
      name: ADMIN_ROLE.name,
      baseRole: ADMIN_ROLE.baseRole,
      isSystem: true,
      isActive: true,
      scope: ADMIN_ROLE.scope,
      organizationId: null,
    },
    create: {
      ...ADMIN_ROLE,
      isSystem: true,
      isActive: true,
      organizationId: null,
    },
  });

  const permissions = await prisma.permission.findMany({
    where: {
      action: { in: FOUNDATION_PERMISSIONS.map(([action]) => action) },
      isActive: true,
    },
    select: { id: true },
  });

  await prisma.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId: role.id,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });
}

export async function runFoundationSeed(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    await syncPermissions(tx);
    await syncAdminRole(tx);
  });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await runFoundationSeed(prisma);
    console.log('Foundation system metadata synchronized.');
    console.log(
      'Tenant, user, membership, and Platform Admin provisioning remain explicit operator actions.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
