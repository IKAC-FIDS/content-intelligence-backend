import { OrganizationMembershipStatus, OrganizationOnboardingStatus, OrganizationStatus, Prisma, PrismaClient } from '@prisma/client';

type Client = PrismaClient;

async function columnExists(prisma: Client, table: string, column: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
    ) AS "exists"
  `);
  return rows[0]?.exists === true;
}

export async function tenantOnboardingPreflight(prisma: Client) {
  const schemaReady = await columnExists(prisma, 'organizations', 'onboardingStatus');
  const ownerReady = await columnExists(prisma, 'organization_memberships', 'isTenantOwner');
  const [organizations, memberships, teams, platformAuthorities] = await Promise.all([
    prisma.organization.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.organizationMembership.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.team.groupBy({ by: ['organizationId'], _count: { _all: true } }),
    prisma.platformAuthority.count(),
  ]);
  const owners = ownerReady
    ? await prisma.organizationMembership.groupBy({
        by: ['organizationId'],
        where: { isTenantOwner: true, status: OrganizationMembershipStatus.ACTIVE },
        _count: { _all: true },
      })
    : [];
  return {
    status: 'ready',
    schemaReady,
    ownerReady,
    organizations,
    memberships,
    teams,
    activeOwnerReport: owners,
    platformAuthorities,
    backfill: 'report-only; no Tenant Owner is inferred automatically',
  };
}

export async function tenantOnboardingValidate(prisma: Client) {
  const [invalidActive, invalidOwner, archivedOperational] = await Promise.all([
    prisma.organization.count({
      where: {
        status: OrganizationStatus.ACTIVE,
        onboardingStatus: { in: [OrganizationOnboardingStatus.IN_PROGRESS, OrganizationOnboardingStatus.FAILED] },
      },
    }),
    prisma.organizationMembership.count({
      where: { isTenantOwner: true, OR: [{ status: { not: OrganizationMembershipStatus.ACTIVE } }, { user: { isActive: false } }] },
    }),
    prisma.organization.count({ where: { status: OrganizationStatus.ARCHIVED, onboardingStatus: OrganizationOnboardingStatus.IN_PROGRESS } }),
  ]);
  return {
    status: invalidActive === 0 && invalidOwner === 0 && archivedOperational === 0 ? 'passed' : 'failed',
    invalidActiveOnboarding: invalidActive,
    invalidTenantOwners: invalidOwner,
    archivedInProgress: archivedOperational,
  };
}

async function main() {
  const command = process.argv[2];
  const prisma = new PrismaClient();
  try {
    const result = command === 'preflight'
      ? await tenantOnboardingPreflight(prisma)
      : command === 'validate'
        ? await tenantOnboardingValidate(prisma)
        : (() => { throw new Error('Expected preflight or validate'); })();
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'failed') process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Tenant onboarding maintenance failed');
    process.exitCode = 1;
  });
}
