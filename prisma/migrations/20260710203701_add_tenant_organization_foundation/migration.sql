-- Add tenant/organization foundation.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrganizationStatus') THEN
    CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Tehran',
  "locale" TEXT NOT NULL DEFAULT 'fa-IR',
  "settings" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_code_key" ON "organizations"("code");

INSERT INTO "organizations" (
  "id",
  "code",
  "name",
  "status",
  "timezone",
  "locale",
  "createdAt",
  "updatedAt"
)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'default',
  'Default Organization',
  'ACTIVE',
  'Asia/Tehran',
  'fa-IR',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "id" = EXCLUDED."id",
  "code" = EXCLUDED."code",
  "name" = EXCLUDED."name",
  "status" = EXCLUDED."status",
  "timezone" = EXCLUDED."timezone",
  "locale" = EXCLUDED."locale",
  "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE "file_attachments"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE "audit_logs"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

UPDATE "users"
SET "organizationId" = '00000000-0000-4000-8000-000000000001'
WHERE "organizationId" IS NULL;

UPDATE "companies"
SET "organizationId" = '00000000-0000-4000-8000-000000000001'
WHERE "organizationId" IS NULL;

UPDATE "opportunities"
SET "organizationId" = '00000000-0000-4000-8000-000000000001'
WHERE "organizationId" IS NULL;

UPDATE "tasks"
SET "organizationId" = '00000000-0000-4000-8000-000000000001'
WHERE "organizationId" IS NULL;

UPDATE "notifications"
SET "organizationId" = '00000000-0000-4000-8000-000000000001'
WHERE "organizationId" IS NULL;

UPDATE "file_attachments"
SET "organizationId" = '00000000-0000-4000-8000-000000000001'
WHERE "organizationId" IS NULL;

UPDATE "audit_logs"
SET "organizationId" = '00000000-0000-4000-8000-000000000001'
WHERE "organizationId" IS NULL;

CREATE INDEX IF NOT EXISTS "organizations_status_idx" ON "organizations"("status");
CREATE INDEX IF NOT EXISTS "organizations_createdAt_idx" ON "organizations"("createdAt");

CREATE INDEX IF NOT EXISTS "users_organizationId_idx" ON "users"("organizationId");
CREATE INDEX IF NOT EXISTS "companies_organizationId_idx" ON "companies"("organizationId");
CREATE INDEX IF NOT EXISTS "companies_organizationId_ownerId_idx" ON "companies"("organizationId", "ownerId");
CREATE INDEX IF NOT EXISTS "opportunities_organizationId_idx" ON "opportunities"("organizationId");
CREATE INDEX IF NOT EXISTS "opportunities_organizationId_ownerId_idx" ON "opportunities"("organizationId", "ownerId");
CREATE INDEX IF NOT EXISTS "opportunities_organizationId_stageId_idx" ON "opportunities"("organizationId", "stageId");
CREATE INDEX IF NOT EXISTS "tasks_organizationId_idx" ON "tasks"("organizationId");
CREATE INDEX IF NOT EXISTS "tasks_organizationId_assignedToId_status_dueAt_idx" ON "tasks"("organizationId", "assignedToId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "notifications_organizationId_idx" ON "notifications"("organizationId");
CREATE INDEX IF NOT EXISTS "notifications_organizationId_recipientId_readAt_archivedAt__idx" ON "notifications"("organizationId", "recipientId", "readAt", "archivedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "file_attachments_organizationId_idx" ON "file_attachments"("organizationId");
CREATE INDEX IF NOT EXISTS "file_attachments_organizationId_entityType_entityId_idx" ON "file_attachments"("organizationId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_organizationId_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_organizationId_fkey') THEN
    ALTER TABLE "companies" ADD CONSTRAINT "companies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opportunities_organizationId_fkey') THEN
    ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_organizationId_fkey') THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_organizationId_fkey') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'file_attachments_organizationId_fkey') THEN
    ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_organizationId_fkey') THEN
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
