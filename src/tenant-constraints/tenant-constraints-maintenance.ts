import { Prisma, PrismaClient } from '@prisma/client';

type CountRow = { count: bigint | number };
type DuplicateRow = {
  organizationId?: string;
  code: string;
  count: bigint | number;
};
type IndexRow = { indexname: string; indexdef: string };
type TableRow = { tableName: string | null };

export type TenantConstraintReport = {
  status: 'ready' | 'blocked' | 'passed' | 'failed';
  teams: {
    total: number;
    withOrganizationId: number;
    withoutOrganizationId: number;
    invalidOrganizationReferences: number;
    deterministicallyAssignable: number;
    ambiguous: number;
    conflictingOwnership: number;
    crossTenantManagers: number;
    crossTenantMemberships: number;
    membershipTableExists: boolean;
    duplicateGlobalCodes: DuplicateRow[];
    duplicateTenantCodes: DuplicateRow[];
  };
  indexes: IndexRow[];
  blockingConflicts: string[];
  decisions: Record<string, string>;
};

const decisions = {
  Team: 'Tenant-owned; reuse required organizationId and scope code uniqueness by organization.',
  Role: 'Platform/global; excluded.',
  LeadSource: 'Platform/global shared catalog; excluded.',
  LookupOption: 'Platform/global shared configuration; excluded.',
  PipelineStage: 'Platform/global shared pipeline configuration; excluded.',
  ProductCatalogItem: 'Platform/global catalog; excluded.',
  CurrencyExchangeRate: 'Platform/global reference; excluded.',
  OpportunityCommercialDocument: 'Indirect Tenant ownership through required Opportunity; direct discriminator deferred as redundant.',
  OpportunityPayment: 'Indirect Tenant ownership through required Opportunity; direct discriminator deferred as redundant.',
};

function count(rows: CountRow[]) {
  return Number(rows[0]?.count ?? 0);
}

function normalizeDuplicates(rows: DuplicateRow[]) {
  return rows.map((row) => ({ ...row, count: Number(row.count) }));
}

export async function inspectTenantConstraints(
  prisma: PrismaClient,
): Promise<TenantConstraintReport> {
  const membershipTable = await prisma.$queryRaw<TableRow[]>(Prisma.sql`
    SELECT to_regclass('public.organization_memberships')::text AS "tableName"
  `);
  const membershipTableExists = Boolean(membershipTable[0]?.tableName);
  const [
    total,
    missing,
    invalidOrganizations,
    crossTenantManagers,
    crossTenantMemberships,
    duplicateGlobalCodes,
    duplicateTenantCodes,
    indexes,
  ] = await Promise.all([
    prisma.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*) AS count FROM "teams"`),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*) AS count FROM "teams" WHERE "organizationId" IS NULL`),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS count
      FROM "teams" team
      LEFT JOIN "organizations" organization ON organization."id" = team."organizationId"
      WHERE organization."id" IS NULL
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS count
      FROM "teams" team
      JOIN "users" manager ON manager."id" = team."managerId"
      WHERE manager."organizationId" <> team."organizationId"
    `),
    membershipTableExists
      ? prisma.$queryRaw<CountRow[]>(Prisma.sql`
          SELECT COUNT(*) AS count
          FROM "organization_memberships" membership
          JOIN "teams" team ON team."id" = membership."teamId"
          WHERE membership."organizationId" <> team."organizationId"
        `)
      : Promise.resolve([{ count: 0 }]),
    prisma.$queryRaw<DuplicateRow[]>(Prisma.sql`
      SELECT "code", COUNT(*) AS count
      FROM "teams"
      GROUP BY "code"
      HAVING COUNT(*) > 1
      ORDER BY "code"
    `),
    prisma.$queryRaw<DuplicateRow[]>(Prisma.sql`
      SELECT "organizationId", "code", COUNT(*) AS count
      FROM "teams"
      GROUP BY "organizationId", "code"
      HAVING COUNT(*) > 1
      ORDER BY "organizationId", "code"
    `),
    prisma.$queryRaw<IndexRow[]>(Prisma.sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'teams'
      ORDER BY indexname
    `),
  ]);

  const totalCount = count(total);
  const missingCount = count(missing);
  const invalidCount = count(invalidOrganizations);
  const managerConflictCount = count(crossTenantManagers);
  const membershipConflictCount = count(crossTenantMemberships);
  const tenantDuplicates = normalizeDuplicates(duplicateTenantCodes);
  const blockingConflicts: string[] = [];
  if (missingCount) blockingConflicts.push(`teams missing organizationId: ${missingCount}`);
  if (invalidCount) blockingConflicts.push(`teams with invalid Organization reference: ${invalidCount}`);
  if (managerConflictCount) blockingConflicts.push(`cross-Tenant Team managers: ${managerConflictCount}`);
  if (membershipConflictCount) blockingConflicts.push(`cross-Tenant Membership teams: ${membershipConflictCount}`);
  if (tenantDuplicates.length) blockingConflicts.push(`duplicate Tenant-scoped Team codes: ${tenantDuplicates.length}`);

  return {
    status: blockingConflicts.length ? 'blocked' : 'ready',
    teams: {
      total: totalCount,
      withOrganizationId: totalCount - missingCount,
      withoutOrganizationId: missingCount,
      invalidOrganizationReferences: invalidCount,
      deterministicallyAssignable: 0,
      ambiguous: missingCount,
      conflictingOwnership: invalidCount + managerConflictCount + membershipConflictCount,
      crossTenantManagers: managerConflictCount,
      crossTenantMemberships: membershipConflictCount,
      membershipTableExists,
      duplicateGlobalCodes: normalizeDuplicates(duplicateGlobalCodes),
      duplicateTenantCodes: tenantDuplicates,
    },
    indexes,
    blockingConflicts,
    decisions,
  };
}

export async function backfillTenantConstraints(
  prisma: PrismaClient,
  options: { dryRun: boolean; confirmApply: boolean; batchSize?: number },
) {
  if (!options.dryRun && !options.confirmApply) {
    throw new Error('Apply mode requires --confirm-apply');
  }
  const report = await inspectTenantConstraints(prisma);
  if (report.blockingConflicts.length) {
    return { ...report, dryRun: options.dryRun, updated: 0 };
  }
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 100, 500));
  return {
    ...report,
    status: options.dryRun ? ('ready' as const) : ('applied' as const),
    dryRun: options.dryRun,
    batchSize,
    updated: 0,
    unchanged: report.teams.total,
    note: 'Team.organizationId is already required; no ownership assignment is necessary or permitted.',
  };
}

export async function validateTenantConstraints(prisma: PrismaClient) {
  const report = await inspectTenantConstraints(prisma);
  return {
    ...report,
    status: report.blockingConflicts.length ? ('failed' as const) : ('passed' as const),
  };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const batchSizeArgument = args.find((argument) => argument.startsWith('--batch-size='));
  const batchSize = batchSizeArgument
    ? Number(batchSizeArgument.slice('--batch-size='.length))
    : undefined;
  const prisma = new PrismaClient();
  try {
    if (batchSize !== undefined && (!Number.isInteger(batchSize) || batchSize < 1)) {
      throw new Error('--batch-size must be a positive integer');
    }
    const result =
      command === 'preflight'
        ? await inspectTenantConstraints(prisma)
        : command === 'backfill'
          ? await backfillTenantConstraints(prisma, {
              dryRun: args.includes('--dry-run'),
              confirmApply: args.includes('--confirm-apply'),
              batchSize,
            })
          : command === 'validate'
            ? await validateTenantConstraints(prisma)
            : (() => {
                throw new Error('Usage: tenant-constraints-maintenance <preflight|backfill|validate>');
              })();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'blocked' || result.status === 'failed') process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'failed', message: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
