import {
  OrganizationStatus,
  Prisma,
  PrismaClient,
  SsoRoutingKind,
} from "@prisma/client";

const normalizeName = (value: string) =>
  value.trim().toLocaleLowerCase("en-US");
const normalizeDomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");

async function tableReady(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sso_providers' AND column_name='organizationId') AS ready
  `);
  return rows[0]?.ready === true;
}

export async function ssoTenantPreflight(
  prisma: PrismaClient,
  organizationId: string,
) {
  const target = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, code: true, status: true },
  });
  const providers = await prisma.ssoProvider.findMany({
    include: { externalIdentities: true },
  });
  const proposed = providers.map((provider) => ({
    id: provider.id,
    type: provider.type,
    normalizedName: normalizeName(provider.name),
    issuer: provider.issuer,
    clientId: provider.clientId,
    entityId: provider.entityId,
    domains: provider.allowedDomains.map(normalizeDomain),
  }));
  const duplicate = (
    key: "normalizedName" | "issuer" | "clientId" | "entityId",
  ) =>
    Object.entries(
      proposed.reduce<Record<string, string[]>>((out, row) => {
        const value = row[key];
        if (value)
          (out[`${key === "normalizedName" ? row.type + ":" : ""}${value}`] ??=
            []).push(row.id);
        return out;
      }, {}),
    ).filter(([, ids]) => ids.length > 1);
  const domains = Object.entries(
    proposed
      .flatMap((row) => row.domains.map((domain) => ({ id: row.id, domain })))
      .reduce<Record<string, string[]>>((out, row) => {
        (out[row.domain] ??= []).push(row.id);
        return out;
      }, {}),
  ).filter(([, ids]) => ids.length > 1);
  const orphanIdentities = await prisma.externalIdentity
    .count({
      where: {
        OR: [
          { user: { is: null as never } },
          { provider: { is: null as never } },
        ],
      },
    })
    .catch(() => 0);
  const conflicts = {
    names: duplicate("normalizedName"),
    issuers: duplicate("issuer"),
    clientIds: duplicate("clientId"),
    entityIds: duplicate("entityId"),
    domains,
  };
  const incompatibleSecrets = providers.filter(
    (p) => p.clientSecretEnc && !p.clientSecretEnc.startsWith("gcm:"),
  ).length;
  const blocked =
    !target ||
    target.status !== OrganizationStatus.ACTIVE ||
    Object.values(conflicts).some((rows) => rows.length > 0) ||
    orphanIdentities > 0 ||
    incompatibleSecrets > 0;
  return {
    status: blocked ? "blocked" : "ready",
    schemaReady: await tableReady(prisma),
    target,
    providerCount: providers.length,
    providersWithoutOrganization: providers.filter((p) => !p.organizationId)
      .length,
    externalIdentities: providers.reduce(
      (sum, p) => sum + p.externalIdentities.length,
      0,
    ),
    orphanIdentities,
    encryptedSecrets: providers.filter((p) =>
      p.clientSecretEnc?.startsWith("gcm:"),
    ).length,
    incompatibleSecrets,
    conflicts,
    proposed,
  };
}

export async function ssoTenantBackfill(
  prisma: PrismaClient,
  organizationId: string,
  confirmApply: boolean,
) {
  const preflight = await ssoTenantPreflight(prisma, organizationId);
  if (preflight.status !== "ready" || !preflight.schemaReady)
    throw new Error("SSO tenant backfill preflight is blocked");
  const pending = await prisma.ssoProvider.findMany({
    where: { organizationId: null },
  });
  if (!confirmApply)
    return {
      status: "ready",
      dryRun: true,
      wouldUpdate: pending.length,
      routesToCreate: pending.reduce(
        (sum, p) => sum + new Set(p.allowedDomains.map(normalizeDomain)).size,
        0,
      ),
    };
  return prisma.$transaction(async (tx) => {
    let routesCreated = 0;
    for (const provider of pending) {
      await tx.ssoProvider.update({
        where: { id: provider.id },
        data: { organizationId, normalizedName: normalizeName(provider.name) },
      });
      const routes = [
        ...new Set(
          provider.allowedDomains.map(normalizeDomain).filter(Boolean),
        ),
      ];
      if (routes.length)
        routesCreated += (
          await tx.ssoProviderRoute.createMany({
            data: routes.map((value) => ({
              organizationId,
              providerId: provider.id,
              kind: SsoRoutingKind.DOMAIN,
              value,
            })),
            skipDuplicates: true,
          })
        ).count;
    }
    if (pending.length)
      await tx.auditLog.create({
        data: {
          organizationId: null,
          entityType: "SsoProvider",
          action: "sso.provider.tenant-backfilled",
          metadata: {
            targetOrganizationId: organizationId,
            providersUpdated: pending.length,
            routesCreated,
            source: "operator-cli",
          },
        },
      });
    return {
      status: "applied",
      dryRun: false,
      updated: pending.length,
      routesCreated,
    };
  });
}

export async function ssoTenantValidate(prisma: PrismaClient) {
  const [
    providers,
    withoutOrganization,
    withoutNormalizedName,
    identityCount,
    orphanIdentities,
  ] = await Promise.all([
    prisma.ssoProvider.count(),
    prisma.ssoProvider.count({ where: { organizationId: null } }),
    prisma.ssoProvider.count({ where: { normalizedName: null } }),
    prisma.externalIdentity.count(),
    prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS count FROM external_identities e LEFT JOIN sso_providers p ON p.id=e."providerId" LEFT JOIN users u ON u.id=e."userId" WHERE p.id IS NULL OR u.id IS NULL`,
    ),
  ]);
  return {
    status:
      withoutOrganization === 0 &&
      withoutNormalizedName === 0 &&
      Number(orphanIdentities[0]?.count ?? 0) === 0
        ? "passed"
        : "failed",
    providers,
    withoutOrganization,
    withoutNormalizedName,
    identityCount,
    orphanIdentities: Number(orphanIdentities[0]?.count ?? 0),
  };
}

function arg(name: string, args: string[]) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const organizationId = arg("--organization-id", args);
  if (!organizationId) throw new Error("--organization-id is required");
  const prisma = new PrismaClient();
  try {
    const result =
      command === "preflight"
        ? await ssoTenantPreflight(prisma, organizationId)
        : command === "backfill"
          ? await ssoTenantBackfill(
              prisma,
              organizationId,
              args.includes("--confirm-apply"),
            )
          : command === "validate"
            ? await ssoTenantValidate(prisma)
            : (() => {
                throw new Error("Expected preflight, backfill, or validate");
              })();
    console.log(JSON.stringify(result, null, 2));
    if (
      "status" in result &&
      (result.status === "blocked" || result.status === "failed")
    )
      process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
if (require.main === module)
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "SSO tenant maintenance failed",
    );
    process.exitCode = 1;
  });
