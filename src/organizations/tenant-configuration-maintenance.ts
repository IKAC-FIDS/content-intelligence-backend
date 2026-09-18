import {
  OrganizationCalendarSystem,
  OrganizationDateFormat,
  Prisma,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();

export async function tenantConfigurationPreflight(
  db: PrismaClient,
  organizationId?: string,
) {
  const [
    organizations,
    duplicateCodes,
    settings,
    branding,
    domains,
    files,
    platformAdmins,
    activeMemberships,
  ] = await Promise.all([
    db.organization.groupBy({ by: ["status"], _count: { _all: true } }),
    db.$queryRaw<Array<{ code: string; count: bigint }>>(
      Prisma.sql`SELECT lower(trim("code")) AS code, count(*) AS count FROM "organizations" GROUP BY lower(trim("code")) HAVING count(*) > 1`,
    ),
    db.organizationSettings.count(),
    db.organizationBranding.count(),
    db.organizationDomain.count(),
    db.fileAttachment.count(),
    db.platformAuthority.count(),
    db.organizationMembership.count({ where: { status: "ACTIVE" } }),
  ]);
  const target = organizationId
    ? await db.organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          code: true,
          status: true,
          timezone: true,
          locale: true,
          tenantSettings: { select: { id: true } },
        },
      })
    : null;
  return {
    status:
      duplicateCodes.length || (organizationId && !target)
        ? "blocked"
        : "ready",
    organizations,
    duplicateCodes: duplicateCodes.map((row) => ({
      ...row,
      count: Number(row.count),
    })),
    existing: {
      settings,
      branding,
      domains,
      files,
      platformAdmins,
      activeMemberships,
    },
    target,
  };
}

export async function tenantConfigurationBackfill(
  db: PrismaClient,
  organizationId: string,
  confirmApply: boolean,
) {
  const preflight = await tenantConfigurationPreflight(db, organizationId);
  if (preflight.status !== "ready" || !preflight.target)
    throw new Error("Tenant configuration preflight is blocked");
  const wouldCreate = preflight.target.tenantSettings ? 0 : 1;
  if (!confirmApply)
    return {
      status: "ready",
      dryRun: true,
      wouldCreate,
      organizationId,
      timezone: preflight.target.timezone,
      locale: preflight.target.locale,
    };
  if (!wouldCreate) return { status: "unchanged", created: 0, organizationId };
  const result = await db.$transaction(async (tx) => {
    const created = await tx.organizationSettings.createMany({
      data: [
        {
          organizationId,
          timezone: preflight.target!.timezone || "Asia/Tehran",
          locale: preflight.target!.locale || "fa-IR",
          calendarSystem: OrganizationCalendarSystem.PERSIAN,
          dateFormat: OrganizationDateFormat.YYYY_MM_DD,
          firstDayOfWeek: 6,
        },
      ],
      skipDuplicates: true,
    });
    if (created.count)
      await tx.auditLog.create({
        data: {
          organizationId,
          entityType: "OrganizationSettings",
          action: "organization.settings.backfilled",
          metadata: { source: "legacy-organization-fields" },
        },
      });
    return created.count;
  });
  return {
    status: result ? "created" : "unchanged",
    created: result,
    organizationId,
  };
}

export async function tenantConfigurationValidate(db: PrismaClient) {
  const invalidSettings = await db.organizationSettings.count({
    where: {
      OR: [{ firstDayOfWeek: { lt: 0 } }, { firstDayOfWeek: { gt: 6 } }],
    },
  });
  const orphanDomains = await db.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`SELECT count(*) AS count FROM "organization_domains" d LEFT JOIN "organizations" o ON o.id=d."organizationId" WHERE o.id IS NULL`,
  );
  return {
    status:
      invalidSettings === 0 && Number(orphanDomains[0]?.count ?? 0) === 0
        ? "passed"
        : "failed",
    invalidSettings,
    orphanDomains: Number(orphanDomains[0]?.count ?? 0),
    settings: await db.organizationSettings.count(),
    branding: await db.organizationBranding.count(),
    domains: await db.organizationDomain.count(),
  };
}

async function main() {
  const [command] = process.argv.slice(2);
  const organizationId = process.argv
    .find((value) => value.startsWith("--organization-id="))
    ?.split("=")[1];
  if (!command) throw new Error("Command is required");
  if ((command === "backfill" || command === "preflight") && !organizationId)
    throw new Error("--organization-id=<exact-id> is required");
  const result =
    command === "preflight"
      ? await tenantConfigurationPreflight(prisma, organizationId)
      : command === "backfill"
        ? await tenantConfigurationBackfill(
            prisma,
            organizationId!,
            process.argv.includes("--confirm-apply"),
          )
        : command === "validate"
          ? await tenantConfigurationValidate(prisma)
          : (() => {
              throw new Error("Unknown command");
            })();
  console.log(JSON.stringify(result, null, 2));
  if (
    "status" in result &&
    (result.status === "blocked" || result.status === "failed")
  )
    process.exitCode = 1;
}

if (require.main === module)
  main()
    .catch((error: unknown) => {
      console.error(
        error instanceof Error
          ? error.message
          : "Tenant configuration maintenance failed",
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
