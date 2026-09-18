import {
  OrganizationMembershipStatus,
  OrganizationStatus,
} from '@prisma/client';
import {
  backfillMemberships,
  buildMembershipPlan,
  validateMemberships,
} from '../src/organization-memberships/membership-maintenance';

const candidate = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  organizationId: 'org-1',
  roleId: 'role-1',
  teamId: 'team-1',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  lastLoginAt: new Date('2026-07-01T00:00:00Z'),
  organization: { id: 'org-1', status: OrganizationStatus.ACTIVE },
  assignedRole: { id: 'role-1' },
  teamRef: { id: 'team-1', organizationId: 'org-1' },
  ...overrides,
});

const existing = (overrides: Record<string, unknown> = {}) => ({
  id: 'membership-1',
  userId: 'user-1',
  organizationId: 'org-1',
  roleId: 'role-1',
  teamId: 'team-1',
  status: OrganizationMembershipStatus.ACTIVE,
  isDefault: true,
  ...overrides,
});

function setup(users = [candidate()], memberships: any[] = []) {
  const tx = {
    organizationMembership: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ exists: true }]),
    $transaction: jest.fn(async (callback: (value: any) => unknown) => callback(tx)),
    user: { findMany: jest.fn().mockResolvedValue(users) },
    organizationMembership: {
      findMany: jest.fn().mockResolvedValue(memberships),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
  return { prisma, tx };
}

describe('Membership maintenance planning and backfill', () => {
  it('dry-run reports creation and performs no writes', async () => {
    const { prisma, tx } = setup();
    await expect(
      backfillMemberships(prisma as any, {
        dryRun: true,
        confirmApply: false,
      }),
    ).resolves.toMatchObject({ status: 'ready', created: 1, unchanged: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.organizationMembership.create).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation for apply mode', async () => {
    const { prisma } = setup();
    await expect(
      backfillMemberships(prisma as any, {
        dryRun: false,
        confirmApply: false,
      }),
    ).rejects.toThrow('--confirm-apply');
  });

  it('creates the initial Membership using the legacy mapping', async () => {
    const { prisma, tx } = setup();
    const result = await backfillMemberships(prisma as any, {
      dryRun: false,
      confirmApply: true,
      batchSize: 1,
    });
    expect(result).toMatchObject({ status: 'applied', created: 1 });
    expect(tx.organizationMembership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        roleId: 'role-1',
        teamId: 'team-1',
        status: OrganizationMembershipStatus.ACTIVE,
        isDefault: true,
        joinedAt: new Date('2026-01-01T00:00:00Z'),
        lastAccessAt: new Date('2026-07-01T00:00:00Z'),
      }),
    });
  });

  it('reports an existing correct Membership as unchanged on the second run', async () => {
    const { prisma, tx } = setup([candidate()], [existing()]);
    await expect(
      backfillMemberships(prisma as any, {
        dryRun: false,
        confirmApply: true,
      }),
    ).resolves.toMatchObject({ status: 'applied', created: 0, unchanged: 1 });
    expect(tx.organizationMembership.create).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_ORGANIZATION', { organization: null }],
    ['INVALID_ROLE', { assignedRole: null }],
    ['INVALID_TEAM', { teamRef: null }],
    [
      'CROSS_ORGANIZATION_TEAM',
      { teamRef: { id: 'team-1', organizationId: 'org-2' } },
    ],
  ])('blocks apply for %s', async (code, override) => {
    const { prisma } = setup([candidate(override)]);
    const result = await backfillMemberships(prisma as any, {
      dryRun: false,
      confirmApply: true,
    });
    expect(result).toMatchObject({ status: 'blocked', created: 0 });
    expect(result.conflicts).toContainEqual({ userId: 'user-1', code });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks conflicting existing Memberships without overwriting them', async () => {
    const { prisma } = setup([candidate()], [existing({ roleId: 'different' })]);
    const plan = await buildMembershipPlan(prisma as any);
    expect(plan.conflicts).toContainEqual({
      userId: 'user-1',
      code: 'EXISTING_MEMBERSHIP_CONFLICT',
    });
  });

  it('uses bounded transactions for batches', async () => {
    const users = [candidate({ id: 'u1' }), candidate({ id: 'u2' }), candidate({ id: 'u3' })];
    const { prisma } = setup(users);
    await backfillMemberships(prisma as any, {
      dryRun: false,
      confirmApply: true,
      batchSize: 2,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('propagates transaction failure without reporting a partial success', async () => {
    const { prisma } = setup();
    prisma.$transaction.mockRejectedValue(new Error('write failed'));
    await expect(
      backfillMemberships(prisma as any, {
        dryRun: false,
        confirmApply: true,
      }),
    ).rejects.toThrow('write failed');
  });

  it('validates parity and default invariants after backfill', async () => {
    const { prisma } = setup([candidate()], [existing()]);
    await expect(validateMemberships(prisma as any)).resolves.toMatchObject({
      status: 'passed',
      users: 1,
      memberships: 1,
      matching: 1,
      invalidNonActiveDefaults: 0,
      usersWithMultipleActiveDefaults: 0,
    });
  });
});
