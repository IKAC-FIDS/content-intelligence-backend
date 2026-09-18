import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const command = process.argv[2];
const confirmed = process.argv.includes("--confirm-apply");

async function counts() {
  const [total, incomplete, invalidDuration, policies] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { OR: [{ scope: null }, { actorType: null }, { source: null }, { result: null }] } }),
    prisma.auditLog.count({ where: { durationMs: { lt: 0 } } }),
    prisma.auditRetentionPolicy.count(),
  ]);
  return { total, incomplete, invalidDuration, policies };
}

async function backfill(apply: boolean) {
  const before = await counts();
  if (!apply) return { mode: "dry-run", candidates: before.incomplete, ...before };
  if (!confirmed) throw new Error("Backfill apply requires --confirm-apply");
  const changed = await prisma.$executeRaw(Prisma.sql`
    UPDATE "audit_logs"
    SET "scope" = COALESCE("scope", CASE WHEN "organizationId" IS NULL THEN 'SYSTEM'::"AuditScope" ELSE 'TENANT'::"AuditScope" END),
        "actorType" = COALESCE("actorType", CASE WHEN "actorId" IS NULL THEN 'LEGACY'::"AuditActorType" ELSE 'USER'::"AuditActorType" END),
        "source" = COALESCE("source", 'LEGACY'::"AuditSource"),
        "result" = COALESCE("result", 'LEGACY'::"AuditResult")
    WHERE "scope" IS NULL OR "actorType" IS NULL OR "source" IS NULL OR "result" IS NULL
  `);
  return { mode: "apply", changed, before, after: await counts() };
}

async function archive(apply: boolean) {
  const cutoffArg = process.argv.find((value) => value.startsWith("--cutoff="))?.slice(9);
  if (!cutoffArg) throw new Error("Archive requires --cutoff=<UTC ISO instant>");
  const cutoff = new Date(cutoffArg);
  if (Number.isNaN(cutoff.getTime())) throw new Error("Invalid archive cutoff");
  const candidateRows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "count" FROM "audit_logs" a
    WHERE a."createdAt" < ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM "audit_log_archives" ar WHERE ar."originalAuditLogId" = a."id")
  `);
  const candidates = Number(candidateRows[0]?.count ?? 0n);
  if (!apply) return { mode: "dry-run", cutoff: cutoff.toISOString(), candidates, sourceRowsWillBeDeleted: false };
  if (!confirmed) throw new Error("Archive apply requires --confirm-apply");
  const batchId = randomUUID();
  const copied = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "audit_log_archives" (
      "id", "originalAuditLogId", "scope", "organizationId", "actorId", "actorType", "actorMembershipId",
      "requestId", "entityType", "entityId", "action", "before", "after", "ipAddress", "userAgent",
      "requestMethod", "requestPath", "source", "result", "durationMs", "errorCode", "metadata",
      "originalCreatedAt", "archiveBatchId", "contentChecksum"
    )
    SELECT gen_random_uuid()::text, a."id", a."scope", a."organizationId", a."actorId", a."actorType",
      a."actorMembershipId", a."requestId", a."entityType", a."entityId", a."action", a."before", a."after",
      a."ipAddress", a."userAgent", a."requestMethod", a."requestPath", a."source", a."result", a."durationMs",
      a."errorCode", a."metadata", a."createdAt", ${batchId}, md5(row_to_json(a)::text)
    FROM "audit_logs" a
    WHERE a."createdAt" < ${cutoff}
    ON CONFLICT ("originalAuditLogId") DO NOTHING
  `);
  const archived = await prisma.auditLogArchive.count({ where: { archiveBatchId: batchId } });
  if (copied !== archived) throw new Error(`Archive verification failed: copied=${copied} verified=${archived}`);
  return { mode: "apply-copy-only", cutoff: cutoff.toISOString(), batchId, copied, verified: archived, sourceRowsDeleted: 0 };
}

async function main() {
  let result: unknown;
  if (command === "preflight") result = { status: "READY", ...(await counts()) };
  else if (command === "backfill") result = await backfill(confirmed);
  else if (command === "validate") {
    const state = await counts();
    if (state.incomplete || state.invalidDuration) throw new Error(`Audit validation failed: ${JSON.stringify(state)}`);
    result = { status: "VALID", ...state };
  } else if (command === "archive") result = await archive(confirmed);
  else if (command === "retention") {
    const enabled = await prisma.auditRetentionPolicy.count({ where: { enabled: true } });
    result = enabled
      ? { status: "DRY_RUN_ONLY", enabledPolicies: enabled, rowsDeleted: 0 }
      : { status: "RETENTION_POLICY_REQUIRES_APPROVAL", enabledPolicies: 0, rowsDeleted: 0 };
  } else throw new Error("Use preflight, backfill, validate, archive, or retention");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
