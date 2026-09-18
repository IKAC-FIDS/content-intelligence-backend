-- Fix 000095: additive Audit Log V2 expansion. Existing rows and columns remain intact.
CREATE TYPE "AuditScope" AS ENUM ('TENANT', 'PLATFORM', 'SYSTEM');
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'PLATFORM_ADMIN', 'ANONYMOUS', 'SYSTEM', 'LEGACY');
CREATE TYPE "AuditSource" AS ENUM ('WEB', 'API', 'AUTH', 'BACKGROUND_JOB', 'SCHEDULER', 'PLATFORM', 'SYSTEM', 'LEGACY');
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED', 'ERROR', 'LEGACY');

ALTER TABLE "audit_logs"
  ADD COLUMN "scope" "AuditScope",
  ADD COLUMN "actorType" "AuditActorType",
  ADD COLUMN "actorMembershipId" TEXT,
  ADD COLUMN "source" "AuditSource",
  ADD COLUMN "result" "AuditResult",
  ADD COLUMN "durationMs" INTEGER,
  ADD COLUMN "errorCode" TEXT;

CREATE INDEX "audit_logs_scope_createdAt_idx" ON "audit_logs"("scope", "createdAt");
CREATE INDEX "audit_logs_organizationId_scope_createdAt_idx" ON "audit_logs"("organizationId", "scope", "createdAt");
CREATE INDEX "audit_logs_actorMembershipId_createdAt_idx" ON "audit_logs"("actorMembershipId", "createdAt");
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");
CREATE INDEX "audit_logs_source_result_createdAt_idx" ON "audit_logs"("source", "result", "createdAt");

CREATE TABLE "audit_log_archives" (
  "id" TEXT NOT NULL,
  "originalAuditLogId" TEXT NOT NULL,
  "scope" "AuditScope",
  "organizationId" TEXT,
  "actorId" TEXT,
  "actorType" "AuditActorType",
  "actorMembershipId" TEXT,
  "requestId" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "requestMethod" TEXT,
  "requestPath" TEXT,
  "source" "AuditSource",
  "result" "AuditResult",
  "durationMs" INTEGER,
  "errorCode" TEXT,
  "metadata" JSONB,
  "originalCreatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archiveBatchId" TEXT NOT NULL,
  "contentChecksum" TEXT NOT NULL,
  CONSTRAINT "audit_log_archives_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "audit_log_archives_originalAuditLogId_key" ON "audit_log_archives"("originalAuditLogId");
CREATE INDEX "audit_log_archives_organizationId_scope_originalCreatedAt_idx" ON "audit_log_archives"("organizationId", "scope", "originalCreatedAt");
CREATE INDEX "audit_log_archives_archiveBatchId_idx" ON "audit_log_archives"("archiveBatchId");

CREATE TABLE "audit_retention_policies" (
  "id" TEXT NOT NULL,
  "scope" "AuditScope" NOT NULL,
  "organizationId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "retentionDays" INTEGER,
  "archiveBeforeDelete" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "audit_retention_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_retention_policy_days_check" CHECK ("retentionDays" IS NULL OR "retentionDays" > 0)
);
CREATE INDEX "audit_retention_policies_scope_organizationId_idx" ON "audit_retention_policies"("scope", "organizationId");
CREATE INDEX "audit_retention_policies_enabled_idx" ON "audit_retention_policies"("enabled");
