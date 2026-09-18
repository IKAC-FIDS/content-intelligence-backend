import {
  OrganizationMembershipStatus,
  OrganizationStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';

const DEFAULT_BATCH_SIZE = 100;

type MaintenanceClient = PrismaClient | Prisma.TransactionClient;

type Candidate = {
  id: string;
  organizationId: string;
  roleId: string | null;
  teamId: string | null;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  organization: { id: string; status: OrganizationStatus } | null;
  assignedRole: { id: string } | null;
  teamRef: { id: string; organizationId: string } | null;
};

export interface MembershipConflict {
  userId: string;
  code: string;
}

export interface MembershipPlan {
  candidates: Candidate[];
  existing: Array<{
    id: string;
    userId: string;
    organizationId: string;
    roleId: string | null;
    teamId: string | null;
    status: OrganizationMembershipStatus;
    isDefault: boolean;
  }>;
  conflicts: MembershipConflict[];
  createUserIds: string[];
  unchangedUserIds: string[];
}

async function membershipTableExists(prisma: MaintenanceClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.organization_memberships') IS NOT NULL AS "exists"
  `);
  return rows[0]?.exists === true;
}

async function candidates(prisma: MaintenanceClient): Promise<Candidate[]> {
  return prisma.user.findMany({
    select: {
      id: true,
      organizationId: true,
      roleId: true,
      teamId: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
      organization: { select: { id: true, status: true } },
      assignedRole: { select: { id: true } },
      teamRef: { select: { id: true, organizationId: true } },
    },
    orderBy: { id: 'asc' },
  });
}

export async function buildMembershipPlan(
  prisma: PrismaClient,
): Promise<MembershipPlan> {
  const users = await candidates(prisma);
  const hasTable = await membershipTableExists(prisma);
  const existing = hasTable
    ? await prisma.organizationMembership.findMany({
        select: {
          id: true,
          userId: true,
          organizationId: true,
          roleId: true,
          teamId: true,
          status: true,
          isDefault: true,
        },
        orderBy: { userId: 'asc' },
      })
    : [];
  const byUserOrganization = new Map(
    existing.map((item) => [`${item.userId}:${item.organizationId}`, item]),
  );
  const defaultsByUser = new Map<string, number>();
  for (const item of existing) {
    if (item.isDefault && item.status === OrganizationMembershipStatus.ACTIVE) {
      defaultsByUser.set(item.userId, (defaultsByUser.get(item.userId) ?? 0) + 1);
    }
  }

  const conflicts: MembershipConflict[] = [];
  const createUserIds: string[] = [];
  const unchangedUserIds: string[] = [];

  for (const user of users) {
    if (!user.organization) conflicts.push({ userId: user.id, code: 'INVALID_ORGANIZATION' });
    if (user.roleId && !user.assignedRole) conflicts.push({ userId: user.id, code: 'INVALID_ROLE' });
    if (user.teamId && !user.teamRef) conflicts.push({ userId: user.id, code: 'INVALID_TEAM' });
    if (user.teamRef && user.teamRef.organizationId !== user.organizationId) {
      conflicts.push({ userId: user.id, code: 'CROSS_ORGANIZATION_TEAM' });
    }
    if ((defaultsByUser.get(user.id) ?? 0) > 1) {
      conflicts.push({ userId: user.id, code: 'MULTIPLE_ACTIVE_DEFAULTS' });
    }

    const current = byUserOrganization.get(`${user.id}:${user.organizationId}`);
    if (!current) {
      createUserIds.push(user.id);
      continue;
    }

    const correct =
      current.status === OrganizationMembershipStatus.ACTIVE &&
      current.isDefault &&
      current.roleId === user.roleId &&
      current.teamId === user.teamId;
    if (correct) unchangedUserIds.push(user.id);
    else conflicts.push({ userId: user.id, code: 'EXISTING_MEMBERSHIP_CONFLICT' });
  }

  return { candidates: users, existing, conflicts, createUserIds, unchangedUserIds };
}

export async function preflightMemberships(prisma: PrismaClient) {
  const plan = await buildMembershipPlan(prisma);
  const organizations = await prisma.organization.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const roles = await prisma.role.count();
  const teams = await prisma.team.count();
  const activeUsers = plan.candidates.filter((user) => user.isActive).length;

  return {
    status: plan.conflicts.length ? 'blocked' : 'ready',
    users: {
      total: plan.candidates.length,
      active: activeUsers,
      inactive: plan.candidates.length - activeUsers,
      withRoleId: plan.candidates.filter((user) => user.roleId).length,
      withoutRoleId: plan.candidates.filter((user) => !user.roleId).length,
      withTeamId: plan.candidates.filter((user) => user.teamId).length,
      withoutTeamId: plan.candidates.filter((user) => !user.teamId).length,
    },
    organizations,
    teams,
    roles,
    membershipTableExists: await membershipTableExists(prisma),
    existingMemberships: plan.existing.length,
    candidateMemberships: plan.candidates.length,
    candidateDefaults: plan.candidates.length,
    create: plan.createUserIds.length,
    unchanged: plan.unchangedUserIds.length,
    conflicts: plan.conflicts,
  };
}

export async function backfillMemberships(
  prisma: PrismaClient,
  options: { dryRun: boolean; confirmApply: boolean; batchSize?: number },
) {
  if (!options.dryRun && !options.confirmApply) {
    throw new Error('Apply mode requires --confirm-apply');
  }
  if (!(await membershipTableExists(prisma))) {
    throw new Error('organization_memberships table does not exist; apply the reviewed migration first');
  }

  const plan = await buildMembershipPlan(prisma);
  if (plan.conflicts.length) {
    return { status: 'blocked', dryRun: options.dryRun, created: 0, unchanged: plan.unchangedUserIds.length, conflicts: plan.conflicts };
  }
  if (options.dryRun) {
    return { status: 'ready', dryRun: true, created: plan.createUserIds.length, unchanged: plan.unchangedUserIds.length, conflicts: [] };
  }

  const byId = new Map(plan.candidates.map((user) => [user.id, user]));
  const batchSize = Math.max(1, Math.min(options.batchSize ?? DEFAULT_BATCH_SIZE, 500));
  let created = 0;
  for (let offset = 0; offset < plan.createUserIds.length; offset += batchSize) {
    const ids = plan.createUserIds.slice(offset, offset + batchSize);
    await prisma.$transaction(async (tx) => {
      for (const id of ids) {
        const user = byId.get(id);
        if (!user) throw new Error(`Missing candidate ${id}`);
        await tx.organizationMembership.create({
          data: {
            userId: user.id,
            organizationId: user.organizationId,
            roleId: user.roleId,
            teamId: user.teamId,
            status: OrganizationMembershipStatus.ACTIVE,
            isDefault: true,
            joinedAt: user.createdAt,
            invitedAt: null,
            suspendedAt: null,
            lastAccessAt: user.lastLoginAt,
            createdAt: user.createdAt,
          },
        });
      }
    });
    created += ids.length;
  }
  return { status: 'applied', dryRun: false, created, unchanged: plan.unchangedUserIds.length, conflicts: [] };
}

export async function validateMemberships(prisma: PrismaClient) {
  const plan = await buildMembershipPlan(prisma);
  const invalidNonActiveDefaults = await prisma.organizationMembership.count({
    where: { isDefault: true, status: { not: OrganizationMembershipStatus.ACTIVE } },
  });
  const activeDefaultGroups = await prisma.organizationMembership.groupBy({
    by: ['userId'],
    where: { isDefault: true, status: OrganizationMembershipStatus.ACTIVE },
    _count: { _all: true },
    having: { userId: { _count: { gt: 1 } } },
  });
  const valid =
    plan.conflicts.length === 0 &&
    plan.createUserIds.length === 0 &&
    plan.unchangedUserIds.length === plan.candidates.length &&
    invalidNonActiveDefaults === 0 &&
    activeDefaultGroups.length === 0;
  return {
    status: valid ? 'passed' : 'failed',
    users: plan.candidates.length,
    memberships: plan.existing.length,
    expectedMemberships: plan.candidates.length,
    missing: plan.createUserIds.length,
    matching: plan.unchangedUserIds.length,
    invalidNonActiveDefaults,
    usersWithMultipleActiveDefaults: activeDefaultGroups.length,
    conflicts: plan.conflicts,
  };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const prisma = new PrismaClient();
  try {
    const result =
      command === 'preflight'
        ? await preflightMemberships(prisma)
        : command === 'backfill'
          ? await backfillMemberships(prisma, {
              dryRun: args.includes('--dry-run'),
              confirmApply: args.includes('--confirm-apply'),
            })
          : command === 'validate'
            ? await validateMemberships(prisma)
            : (() => {
                throw new Error('Usage: membership-maintenance <preflight|backfill|validate>');
              })();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if ('status' in result && (result.status === 'blocked' || result.status === 'failed')) {
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'failed', message: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
