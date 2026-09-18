-- Phase 4.5 evolves the existing file_attachments table into the unified
-- artifact store, preserving every existing attachment and public identifier.
ALTER TYPE "FileAttachmentEntityType" ADD VALUE IF NOT EXISTS 'COMPANY';
ALTER TYPE "FileAttachmentEntityType" ADD VALUE IF NOT EXISTS 'PERSON';
ALTER TYPE "FileAttachmentEntityType" ADD VALUE IF NOT EXISTS 'TASK';
ALTER TYPE "FileAttachmentEntityType" ADD VALUE IF NOT EXISTS 'ACTIVITY';
ALTER TYPE "FileAttachmentEntityType" ADD VALUE IF NOT EXISTS 'PRODUCT';
ALTER TYPE "FileAttachmentEntityType" ADD VALUE IF NOT EXISTS 'ORGANIZATION';

CREATE TYPE "ArtifactType" AS ENUM ('FILE', 'EXTERNAL_URL');
CREATE TYPE "ArtifactProvider" AS ENUM ('LOCAL', 'OBJECT_STORAGE', 'GOOGLE_DRIVE', 'SHAREPOINT', 'ONEDRIVE', 'GITHUB', 'GENERIC_URL');
CREATE TYPE "ArtifactRelationType" AS ENUM ('ATTACHMENT', 'PROPOSAL', 'CONTRACT', 'TECHNICAL_DOCUMENT', 'MEETING_MINUTES', 'SCREENSHOT', 'EVIDENCE', 'REFERENCE', 'OTHER');

ALTER TABLE "file_attachments"
  ADD COLUMN "type" "ArtifactType" NOT NULL DEFAULT 'FILE',
  ADD COLUMN "provider" "ArtifactProvider" NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN "name" TEXT,
  ADD COLUMN "externalUrl" TEXT,
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "category" TEXT,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "versionLabel" TEXT,
  ADD COLUMN "confidentiality" TEXT,
  ALTER COLUMN "objectKey" DROP NOT NULL,
  ALTER COLUMN "originalFileName" DROP NOT NULL,
  ALTER COLUMN "storedFileName" DROP NOT NULL,
  ALTER COLUMN "mimeType" DROP NOT NULL,
  ALTER COLUMN "sizeBytes" DROP NOT NULL,
  ALTER COLUMN "sha256" DROP NOT NULL;

UPDATE "file_attachments"
SET "name" = COALESCE(NULLIF("originalFileName", ''), 'Artifact'),
    "provider" = CASE WHEN "storageProvider" = 'MINIO' THEN 'OBJECT_STORAGE'::"ArtifactProvider" ELSE 'LOCAL'::"ArtifactProvider" END;

ALTER TABLE "file_attachments" ALTER COLUMN "name" SET NOT NULL;

CREATE TABLE "artifact_links" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "entityType" "FileAttachmentEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "relationType" "ArtifactRelationType" NOT NULL DEFAULT 'ATTACHMENT',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artifact_links_pkey" PRIMARY KEY ("id")
);

INSERT INTO "artifact_links" ("id", "organizationId", "artifactId", "entityType", "entityId", "relationType", "createdById", "createdAt")
SELECT "id", "organizationId", "id", "entityType", "entityId", 'ATTACHMENT', "uploadedById", "createdAt"
FROM "file_attachments";

-- Older deployments did not enforce these user references. Preserve the
-- artifacts while clearing only stale actor references before adding FKs.
UPDATE "file_attachments" SET "uploadedById" = NULL
WHERE "uploadedById" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."id" = "file_attachments"."uploadedById");
UPDATE "file_attachments" SET "deletedById" = NULL
WHERE "deletedById" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."id" = "file_attachments"."deletedById");
UPDATE "artifact_links" SET "createdById" = NULL
WHERE "createdById" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."id" = "artifact_links"."createdById");

ALTER TABLE "file_attachments"
  ADD CONSTRAINT "file_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "file_attachments_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "artifact_links"
  ADD CONSTRAINT "artifact_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "artifact_links_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "file_attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "artifact_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "artifact_links_artifactId_entityType_entityId_relationType_key" ON "artifact_links"("artifactId", "entityType", "entityId", "relationType");
CREATE INDEX "artifact_links_organizationId_entityType_entityId_createdAt_idx" ON "artifact_links"("organizationId", "entityType", "entityId", "createdAt");
CREATE INDEX "artifact_links_artifactId_idx" ON "artifact_links"("artifactId");
CREATE INDEX "artifact_links_relationType_idx" ON "artifact_links"("relationType");
CREATE INDEX "file_attachments_organizationId_type_provider_createdAt_idx" ON "file_attachments"("organizationId", "type", "provider", "createdAt");
CREATE INDEX "file_attachments_organizationId_name_idx" ON "file_attachments"("organizationId", "name");
