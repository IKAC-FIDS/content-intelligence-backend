import { PlatformRole, Prisma, PrismaClient } from '@prisma/client';

type Client = PrismaClient | Prisma.TransactionClient;

async function tableExists(prisma: Client): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.platform_authorities') IS NOT NULL AS "exists"
  `);
  return rows[0]?.exists === true;
}

async function exactUser(prisma: Client, userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, isActive: true },
  });
}

export async function preflightPlatformAuthority(
  prisma: PrismaClient,
  userId?: string,
) {
  const exists = await tableExists(prisma);
  const [
    users,
    activeUsers,
    roleDistribution,
    authorities,
    inactiveAuthorities,
    duplicateAssignments,
    auditColumns,
    target,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    exists ? prisma.platformAuthority.count() : Promise.resolve(0),
    exists
      ? prisma.platformAuthority.count({ where: { user: { isActive: false } } })
      : Promise.resolve(0),
    exists
      ? prisma.$queryRaw<Array<{ userId: string; count: bigint }>>(Prisma.sql`
          SELECT "userId", COUNT(*) AS count
          FROM "platform_authorities"
          GROUP BY "userId"
          HAVING COUNT(*) > 1
        `)
      : Promise.resolve([]),
    prisma.$queryRaw<Array<{ organizationIdNullable: boolean }>>(Prisma.sql`
      SELECT (is_nullable = 'YES') AS "organizationIdNullable"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'audit_logs'
        AND column_name = 'organizationId'
    `),
    userId ? exactUser(prisma, userId) : Promise.resolve(null),
  ]);
  const auditOrganizationIdNullable =
    auditColumns[0]?.organizationIdNullable === true;
  return {
    status:
      (userId && (!target || !target.isActive)) ||
      duplicateAssignments.length > 0 ||
      !auditOrganizationIdNullable
        ? 'blocked'
        : 'ready',
    tableExists: exists,
    users,
    activeUsers,
    roleDistribution,
    authorities,
    inactiveAuthorities,
    duplicateAssignmentCandidates: duplicateAssignments.map((row) => ({
      userId: row.userId,
      count: Number(row.count),
    })),
    auditOrganizationIdNullable,
    target,
  };
}

export async function grantPlatformAuthority(
  prisma: PrismaClient,
  userId: string,
  confirmApply: boolean,
) {
  if (!confirmApply) throw new Error('Grant requires --confirm-apply');
  if (!(await tableExists(prisma))) throw new Error('platform_authorities table does not exist');
  return prisma.$transaction(async (tx) => {
    const user = await exactUser(tx, userId);
    if (!user) throw new Error('Target User does not exist');
    if (!user.isActive) throw new Error('Target User is not active');
    const inserted = await tx.platformAuthority.createMany({
      data: [{ userId, role: PlatformRole.PLATFORM_ADMIN }],
      skipDuplicates: true,
    });
    const authority = await tx.platformAuthority.findUniqueOrThrow({
      where: { userId },
    });
    if (inserted.count === 1) {
      await tx.auditLog.create({
        data: {
          actorId: null,
          actorType: 'SYSTEM',
          scope: 'PLATFORM',
          source: 'SYSTEM',
          result: 'SUCCESS',
          organizationId: null,
          entityType: 'platform-authority',
          entityId: userId,
          action: 'platform-authority.granted',
          metadata: { targetUserId: userId, role: authority.role, source: 'operator-cli' },
        },
      });
    }
    return {
      status: inserted.count === 1 ? 'granted' : 'unchanged',
      user,
      authority,
    };
  });
}

export async function revokePlatformAuthority(
  prisma: PrismaClient,
  userId: string,
  confirmApply: boolean,
) {
  if (!confirmApply) throw new Error('Revoke requires --confirm-apply');
  if (!(await tableExists(prisma))) throw new Error('platform_authorities table does not exist');
  return prisma.$transaction(async (tx) => {
    const user = await exactUser(tx, userId);
    if (!user) throw new Error('Target User does not exist');
    const removed = await tx.platformAuthority.deleteMany({ where: { userId } });
    if (removed.count) {
      await tx.auditLog.create({
        data: {
          actorId: null,
          actorType: 'SYSTEM',
          scope: 'PLATFORM',
          source: 'SYSTEM',
          result: 'SUCCESS',
          organizationId: null,
          entityType: 'platform-authority',
          entityId: userId,
          action: 'platform-authority.revoked',
          metadata: { targetUserId: userId, role: PlatformRole.PLATFORM_ADMIN, source: 'operator-cli' },
        },
      });
    }
    return { status: removed.count ? 'revoked' : 'unchanged', user };
  });
}

export async function validatePlatformAuthority(prisma: PrismaClient) {
  const exists = await tableExists(prisma);
  if (!exists) return { status: 'failed', tableExists: false };
  const [authorities, inactiveAuthorities] = await Promise.all([
    prisma.platformAuthority.count(),
    prisma.platformAuthority.count({ where: { user: { isActive: false } } }),
  ]);
  return {
    status: inactiveAuthorities === 0 ? 'passed' : 'failed',
    tableExists: true,
    authorities,
    inactiveAuthorities,
    zeroAdminRecovery: 'Run platform-admin:grant with an exact active --user-id and --confirm-apply.',
  };
}

function argument(name: string, args: string[]) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const userId = argument('--user-id', args);
  const prisma = new PrismaClient();
  try {
    if ((command === 'grant' || command === 'revoke') && !userId) {
      throw new Error(`${command} requires exact --user-id`);
    }
    const result =
      command === 'preflight'
        ? await preflightPlatformAuthority(prisma, userId)
        : command === 'grant'
          ? await grantPlatformAuthority(prisma, userId!, args.includes('--confirm-apply'))
          : command === 'revoke'
            ? await revokePlatformAuthority(prisma, userId!, args.includes('--confirm-apply'))
            : command === 'validate'
              ? await validatePlatformAuthority(prisma)
              : (() => { throw new Error('Expected preflight, grant, revoke, or validate'); })();
    console.log(JSON.stringify(result, null, 2));
    if ('status' in result && (result.status === 'blocked' || result.status === 'failed')) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Platform authority command failed');
    process.exitCode = 1;
  });
}
