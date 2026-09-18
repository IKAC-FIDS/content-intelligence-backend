const { PrismaClient, Prisma } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const organizations = await prisma.organization.findMany({
      orderBy: { id: 'asc' },
      take: 2,
      select: { id: true },
    });
    if (organizations.length !== 2) throw new Error('Two organizations are required');

    const visible = async (organizationId, rollback = false) => {
      try {
        return await prisma.$transaction(async (tx) => {
          await tx.$queryRaw(Prisma.sql`
            SELECT set_config('app.current_organization_id', ${organizationId}, true)
          `);
          const rows = await tx.$queryRaw(Prisma.sql`
            SELECT id, "organizationId" FROM notifications ORDER BY id
          `);
          if (rows.some((row) => row.organizationId !== organizationId)) {
            throw new Error(`Cross-Tenant row visible for ${organizationId}`);
          }
          if (rollback) throw new Error('EXPECTED_ROLLBACK');
          return rows.length;
        });
      } catch (error) {
        if (rollback && error instanceof Error && error.message === 'EXPECTED_ROLLBACK') return -1;
        throw error;
      }
    };

    const alternating = [];
    for (let index = 0; index < 12; index += 1) {
      alternating.push(await visible(organizations[index % 2].id));
    }
    await visible(organizations[0].id, true);
    const afterRollback = await prisma.notification.count();
    const parallel = await Promise.all([
      visible(organizations[0].id),
      visible(organizations[1].id),
      visible(organizations[0].id),
      visible(organizations[1].id),
    ]);
    const afterCommitAndParallel = await prisma.notification.count();

    if (afterRollback !== 0 || afterCommitAndParallel !== 0) {
      throw new Error('Transaction-local Tenant context leaked into the pool');
    }

    process.stdout.write(`${JSON.stringify({
      passed: true,
      organizations: organizations.map(({ id }) => id),
      alternating,
      parallel,
      noContextAfterRollback: afterRollback,
      noContextAfterCommit: afterCommitAndParallel,
    }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
