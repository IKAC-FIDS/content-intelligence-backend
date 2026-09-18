-- Phase 4.1 is additive: no existing table is rewritten and no data is deleted.
ALTER TYPE "FileAttachmentEntityType" ADD VALUE 'TECHNICAL_DOCUMENT';
ALTER TYPE "FileAttachmentEntityType" ADD VALUE 'TECHNICAL_RESOURCE';

CREATE TYPE "TechnicalReleaseStatus" AS ENUM ('DRAFT', 'PLANNED', 'RELEASED', 'DEPRECATED', 'END_OF_LIFE', 'ARCHIVED');
CREATE TYPE "KnowledgeBaseStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "TechnicalVisibility" AS ENUM ('INTERNAL', 'RESTRICTED');
CREATE TYPE "TechnicalDocumentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'EXPIRED', 'ARCHIVED');
CREATE TYPE "TechnicalConfidentiality" AS ENUM ('INTERNAL', 'CONFIDENTIAL', 'RESTRICTED');
CREATE TYPE "TechnicalResourceType" AS ENUM ('SDK', 'SAMPLE_CODE', 'API_COLLECTION', 'CONFIGURATION', 'DRIVER', 'FIRMWARE', 'SCRIPT', 'TEMPLATE', 'EXTERNAL_LINK', 'OTHER');
CREATE TYPE "TechnicalResourceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED');
CREATE TYPE "TenderType" AS ENUM ('RFP', 'RFQ', 'RFI', 'PUBLIC_TENDER', 'PRIVATE_TENDER', 'TECHNICAL_EVALUATION', 'OTHER');
CREATE TYPE "TenderStatus" AS ENUM ('DRAFT', 'IDENTIFIED', 'QUALIFICATION', 'PREPARING', 'TECHNICAL_REVIEW', 'COMMERCIAL_REVIEW', 'READY_FOR_SUBMISSION', 'SUBMITTED', 'UNDER_EVALUATION', 'CLARIFICATION', 'WON', 'LOST', 'CANCELLED', 'ARCHIVED');
CREATE TYPE "TenderResult" AS ENUM ('WON', 'LOST', 'CANCELLED');
CREATE TYPE "TenderRequirementStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'READY', 'VERIFIED', 'NOT_APPLICABLE', 'BLOCKED');

CREATE TABLE "technical_releases" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "releaseNotes" TEXT,
  "status" "TechnicalReleaseStatus" NOT NULL DEFAULT 'DRAFT',
  "releaseDate" TIMESTAMP(3),
  "supportStartDate" TIMESTAMP(3),
  "supportEndDate" TIMESTAMP(3),
  "endOfLifeDate" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "technical_releases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_base_articles" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "summary" TEXT,
  "content" TEXT NOT NULL,
  "status" "KnowledgeBaseStatus" NOT NULL DEFAULT 'DRAFT',
  "category" TEXT,
  "visibility" "TechnicalVisibility" NOT NULL DEFAULT 'INTERNAL',
  "productId" TEXT,
  "releaseId" TEXT,
  "ownerId" TEXT,
  "authorId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "lastReviewedAt" TIMESTAMP(3),
  "nextReviewAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "knowledge_base_articles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "technical_documents" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "documentType" TEXT NOT NULL,
  "status" "TechnicalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "confidentiality" "TechnicalConfidentiality" NOT NULL DEFAULT 'INTERNAL',
  "ownerId" TEXT NOT NULL,
  "productId" TEXT,
  "releaseId" TEXT,
  "companyId" TEXT,
  "opportunityId" TEXT,
  "tenderId" TEXT,
  "effectiveFrom" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "technical_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "technical_document_versions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "attachmentId" TEXT,
  "contentHash" TEXT,
  "approvalNote" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "technical_document_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "technical_resources" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "resourceType" "TechnicalResourceType" NOT NULL,
  "status" "TechnicalResourceStatus" NOT NULL DEFAULT 'DRAFT',
  "productId" TEXT,
  "releaseId" TEXT,
  "url" TEXT,
  "attachmentId" TEXT,
  "version" TEXT,
  "checksum" TEXT,
  "ownerId" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "technical_resources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "technical_tenders" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "referenceNumber" TEXT,
  "companyId" TEXT,
  "opportunityId" TEXT,
  "ownerId" TEXT NOT NULL,
  "teamId" TEXT,
  "status" "TenderStatus" NOT NULL DEFAULT 'DRAFT',
  "tenderType" "TenderType" NOT NULL,
  "source" TEXT,
  "description" TEXT,
  "submissionDeadline" TIMESTAMP(3),
  "technicalDeadline" TIMESTAMP(3),
  "expectedDecisionDate" TIMESTAMP(3),
  "estimatedValue" DECIMAL(18,2),
  "currency" TEXT DEFAULT 'IRR',
  "probability" INTEGER,
  "technicalLeadId" TEXT,
  "commercialLeadId" TEXT,
  "result" "TenderResult",
  "resultReason" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "technical_tenders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "technical_tenders_probability_check" CHECK ("probability" IS NULL OR ("probability" >= 0 AND "probability" <= 100)),
  CONSTRAINT "technical_tenders_estimated_value_check" CHECK ("estimatedValue" IS NULL OR "estimatedValue" >= 0)
);

CREATE TABLE "tender_requirements" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tenderId" TEXT NOT NULL,
  "category" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "mandatory" BOOLEAN NOT NULL DEFAULT false,
  "status" "TenderRequirementStatus" NOT NULL DEFAULT 'OPEN',
  "ownerId" TEXT,
  "dueDate" TIMESTAMP(3),
  "response" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tender_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tender_deliverables" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tenderId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tender_deliverables_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "technical_releases_organizationId_productId_version_key" ON "technical_releases"("organizationId", "productId", "version");
CREATE INDEX "technical_releases_organizationId_productId_idx" ON "technical_releases"("organizationId", "productId");
CREATE INDEX "technical_releases_organizationId_status_idx" ON "technical_releases"("organizationId", "status");
CREATE UNIQUE INDEX "knowledge_base_articles_organizationId_slug_key" ON "knowledge_base_articles"("organizationId", "slug");
CREATE INDEX "knowledge_base_articles_organizationId_status_idx" ON "knowledge_base_articles"("organizationId", "status");
CREATE INDEX "knowledge_base_articles_organizationId_productId_idx" ON "knowledge_base_articles"("organizationId", "productId");
CREATE INDEX "knowledge_base_articles_organizationId_releaseId_idx" ON "knowledge_base_articles"("organizationId", "releaseId");
CREATE INDEX "knowledge_base_articles_organizationId_nextReviewAt_idx" ON "knowledge_base_articles"("organizationId", "nextReviewAt");
CREATE INDEX "technical_documents_organizationId_status_idx" ON "technical_documents"("organizationId", "status");
CREATE INDEX "technical_documents_organizationId_productId_idx" ON "technical_documents"("organizationId", "productId");
CREATE INDEX "technical_documents_organizationId_releaseId_idx" ON "technical_documents"("organizationId", "releaseId");
CREATE INDEX "technical_documents_organizationId_companyId_idx" ON "technical_documents"("organizationId", "companyId");
CREATE INDEX "technical_documents_organizationId_opportunityId_idx" ON "technical_documents"("organizationId", "opportunityId");
CREATE INDEX "technical_documents_organizationId_tenderId_idx" ON "technical_documents"("organizationId", "tenderId");
CREATE UNIQUE INDEX "technical_document_versions_organizationId_documentId_version_key" ON "technical_document_versions"("organizationId", "documentId", "version");
CREATE INDEX "technical_document_versions_organizationId_documentId_idx" ON "technical_document_versions"("organizationId", "documentId");
CREATE INDEX "technical_resources_organizationId_status_idx" ON "technical_resources"("organizationId", "status");
CREATE INDEX "technical_resources_organizationId_resourceType_idx" ON "technical_resources"("organizationId", "resourceType");
CREATE INDEX "technical_resources_organizationId_productId_idx" ON "technical_resources"("organizationId", "productId");
CREATE INDEX "technical_resources_organizationId_releaseId_idx" ON "technical_resources"("organizationId", "releaseId");
CREATE UNIQUE INDEX "technical_tenders_organizationId_referenceNumber_key" ON "technical_tenders"("organizationId", "referenceNumber");
CREATE INDEX "technical_tenders_organizationId_status_idx" ON "technical_tenders"("organizationId", "status");
CREATE INDEX "technical_tenders_organizationId_companyId_idx" ON "technical_tenders"("organizationId", "companyId");
CREATE INDEX "technical_tenders_organizationId_opportunityId_idx" ON "technical_tenders"("organizationId", "opportunityId");
CREATE INDEX "technical_tenders_organizationId_ownerId_idx" ON "technical_tenders"("organizationId", "ownerId");
CREATE INDEX "technical_tenders_organizationId_teamId_idx" ON "technical_tenders"("organizationId", "teamId");
CREATE INDEX "technical_tenders_organizationId_submissionDeadline_idx" ON "technical_tenders"("organizationId", "submissionDeadline");
CREATE INDEX "tender_requirements_organizationId_tenderId_idx" ON "tender_requirements"("organizationId", "tenderId");
CREATE INDEX "tender_requirements_organizationId_status_idx" ON "tender_requirements"("organizationId", "status");
CREATE UNIQUE INDEX "tender_deliverables_organizationId_tenderId_documentId_key" ON "tender_deliverables"("organizationId", "tenderId", "documentId");
CREATE INDEX "tender_deliverables_organizationId_tenderId_idx" ON "tender_deliverables"("organizationId", "tenderId");

ALTER TABLE "technical_releases" ADD CONSTRAINT "technical_releases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_releases" ADD CONSTRAINT "technical_releases_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_base_articles" ADD CONSTRAINT "knowledge_base_articles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_base_articles" ADD CONSTRAINT "knowledge_base_articles_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_base_articles" ADD CONSTRAINT "knowledge_base_articles_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "technical_releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "technical_releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "technical_tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_document_versions" ADD CONSTRAINT "technical_document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "technical_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_resources" ADD CONSTRAINT "technical_resources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_resources" ADD CONSTRAINT "technical_resources_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_resources" ADD CONSTRAINT "technical_resources_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "technical_releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_tenders" ADD CONSTRAINT "technical_tenders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_tenders" ADD CONSTRAINT "technical_tenders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_tenders" ADD CONSTRAINT "technical_tenders_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_tenders" ADD CONSTRAINT "technical_tenders_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tender_requirements" ADD CONSTRAINT "tender_requirements_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "technical_tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tender_deliverables" ADD CONSTRAINT "tender_deliverables_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "technical_tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tender_deliverables" ADD CONSTRAINT "tender_deliverables_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "technical_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_releases" ADD CONSTRAINT "technical_releases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_releases" ADD CONSTRAINT "technical_releases_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_base_articles" ADD CONSTRAINT "knowledge_base_articles_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_base_articles" ADD CONSTRAINT "knowledge_base_articles_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_base_articles" ADD CONSTRAINT "knowledge_base_articles_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_document_versions" ADD CONSTRAINT "technical_document_versions_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "file_attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_document_versions" ADD CONSTRAINT "technical_document_versions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_document_versions" ADD CONSTRAINT "technical_document_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_resources" ADD CONSTRAINT "technical_resources_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "file_attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_resources" ADD CONSTRAINT "technical_resources_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_resources" ADD CONSTRAINT "technical_resources_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_resources" ADD CONSTRAINT "technical_resources_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_tenders" ADD CONSTRAINT "technical_tenders_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_tenders" ADD CONSTRAINT "technical_tenders_technicalLeadId_fkey" FOREIGN KEY ("technicalLeadId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_tenders" ADD CONSTRAINT "technical_tenders_commercialLeadId_fkey" FOREIGN KEY ("commercialLeadId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_tenders" ADD CONSTRAINT "technical_tenders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_tenders" ADD CONSTRAINT "technical_tenders_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tender_requirements" ADD CONSTRAINT "tender_requirements_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "action", "description", "name", "group", "isSystem", "isActive", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'technical-release:view', 'View technical releases', 'View technical releases', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-release:manage', 'Manage technical releases', 'Manage technical releases', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-release:publish', 'Publish technical releases', 'Publish technical releases', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-knowledge:view', 'View technical knowledge', 'View technical knowledge', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-knowledge:manage', 'Manage technical knowledge', 'Manage technical knowledge', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-knowledge:publish', 'Publish technical knowledge', 'Publish technical knowledge', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-document:view', 'View technical documents', 'View technical documents', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-document:manage', 'Manage technical documents', 'Manage technical documents', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-document:approve', 'Approve technical documents', 'Approve technical documents', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-resource:view', 'View technical resources', 'View technical resources', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-resource:manage', 'Manage technical resources', 'Manage technical resources', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-tender:view', 'View technical tenders', 'View technical tenders', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-tender:manage', 'Manage technical tenders', 'Manage technical tenders', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-tender:submit', 'Submit technical tenders', 'Submit technical tenders', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-tender:close', 'Close technical tenders', 'Close technical tenders', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("action") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'ADMIN'::"UserRole", r."id", p."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" = 'ADMIN' AND r."isSystem" = true AND p."action" LIKE 'technical-%'
ON CONFLICT DO NOTHING;
