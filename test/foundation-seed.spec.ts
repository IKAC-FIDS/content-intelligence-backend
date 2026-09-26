import {
  FOUNDATION_PERMISSIONS,
  runFoundationSeed,
} from '../prisma/seed';

describe('Foundation Seed', () => {
  function client(existingRole?: {
    id: string;
    isSystem: boolean;
    scope: 'SYSTEM' | 'TENANT';
    organizationId: string | null;
  }) {
    const permissionIds = FOUNDATION_PERMISSIONS.map(([action], index) => ({
      id: `permission-${index}-${action}`,
    }));
    const tx = {
      permission: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue(permissionIds),
      },
      role: {
        findUnique: jest.fn().mockResolvedValue(existingRole ?? null),
        upsert: jest.fn().mockResolvedValue({ id: 'system-admin' }),
      },
      rolePermission: {
        createMany: jest.fn().mockResolvedValue({ count: permissionIds.length }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (value: typeof tx) => unknown) =>
        operation(tx),
      ),
    };
    return { prisma, tx };
  }

  it('synchronizes only foundation permissions and the protected ADMIN role', async () => {
    const { prisma, tx } = client();

    await runFoundationSeed(prisma as never);

    expect(tx.permission.upsert).toHaveBeenCalledTimes(
      FOUNDATION_PERMISSIONS.length,
    );
    expect(tx.role.upsert).toHaveBeenCalledTimes(1);
    expect(tx.role.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: 'ADMIN' },
        create: expect.objectContaining({
          isSystem: true,
          scope: 'SYSTEM',
          organizationId: null,
        }),
      }),
    );
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ roleId: 'system-admin' }),
      ]),
      skipDuplicates: true,
    });
    expect(tx).not.toHaveProperty('organization');
    expect(tx).not.toHaveProperty('user');
    expect(tx).not.toHaveProperty('organizationMembership');
    expect(tx).not.toHaveProperty('team');
    expect(tx).not.toHaveProperty('platformAuthority');
  });

  it('uses stable upserts and duplicate-safe role-permission inserts', async () => {
    const { prisma, tx } = client({
      id: 'system-admin',
      isSystem: true,
      scope: 'SYSTEM',
      organizationId: null,
    });

    await runFoundationSeed(prisma as never);
    await runFoundationSeed(prisma as never);

    expect(tx.permission.upsert).toHaveBeenCalledTimes(
      FOUNDATION_PERMISSIONS.length * 2,
    );
    expect(tx.role.upsert).toHaveBeenCalledTimes(2);
    expect(tx.rolePermission.createMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('refuses to overwrite a custom role using the reserved ADMIN code', async () => {
    const { prisma, tx } = client({
      id: 'tenant-admin',
      isSystem: false,
      scope: 'TENANT',
      organizationId: 'organization-a',
    });

    await expect(runFoundationSeed(prisma as never)).rejects.toThrow(
      'reserved ADMIN role code',
    );
    expect(tx.role.upsert).not.toHaveBeenCalled();
    expect(tx.rolePermission.createMany).not.toHaveBeenCalled();
  });
});
