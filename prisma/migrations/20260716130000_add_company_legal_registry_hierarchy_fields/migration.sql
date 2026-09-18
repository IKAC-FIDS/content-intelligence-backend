CREATE TYPE "CompanyActivityStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MERGED', 'UNKNOWN');
CREATE TYPE "CompanyLegalDocumentType" AS ENUM ('OFFICIAL_GAZETTE', 'LATEST_CHANGES');

ALTER TYPE "FileAttachmentEntityType" ADD VALUE 'COMPANY_LEGAL_DOCUMENT';

ALTER TABLE "companies"
  ADD COLUMN "registrationNumber" TEXT,
  ADD COLUMN "establishmentDate" TIMESTAMP(3);

ALTER TABLE "companies"
  ALTER COLUMN "registeredCapital" TYPE DECIMAL(24,2)
  USING "registeredCapital"::DECIMAL(24,2);

ALTER TABLE "companies" ADD COLUMN "activityStatus_new" "CompanyActivityStatus" NOT NULL DEFAULT 'UNKNOWN';
UPDATE "companies"
SET "activityStatus_new" = CASE UPPER(COALESCE("activityStatus", ''))
  WHEN 'ACTIVE' THEN 'ACTIVE'::"CompanyActivityStatus"
  WHEN 'INACTIVE' THEN 'INACTIVE'::"CompanyActivityStatus"
  WHEN 'MERGED' THEN 'MERGED'::"CompanyActivityStatus"
  ELSE 'UNKNOWN'::"CompanyActivityStatus"
END;
ALTER TABLE "companies" DROP COLUMN "activityStatus";
ALTER TABLE "companies" RENAME COLUMN "activityStatus_new" TO "activityStatus";

CREATE TABLE "company_hierarchy_relations" (
  "id" TEXT NOT NULL,
  "parentCompanyId" TEXT NOT NULL,
  "subsidiaryCompanyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_hierarchy_relations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_hierarchy_relations_no_self" CHECK ("parentCompanyId" <> "subsidiaryCompanyId")
);
CREATE UNIQUE INDEX "company_hierarchy_relations_parentCompanyId_subsidiaryCompanyId_key" ON "company_hierarchy_relations"("parentCompanyId", "subsidiaryCompanyId");
CREATE INDEX "company_hierarchy_relations_subsidiaryCompanyId_idx" ON "company_hierarchy_relations"("subsidiaryCompanyId");
ALTER TABLE "company_hierarchy_relations" ADD CONSTRAINT "company_hierarchy_relations_parentCompanyId_fkey" FOREIGN KEY ("parentCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_hierarchy_relations" ADD CONSTRAINT "company_hierarchy_relations_subsidiaryCompanyId_fkey" FOREIGN KEY ("subsidiaryCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "company_legal_documents" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "type" "CompanyLegalDocumentType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "documentDate" TIMESTAMP(3),
  "attachmentId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_legal_documents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "company_legal_documents_attachmentId_key" ON "company_legal_documents"("attachmentId");
CREATE INDEX "company_legal_documents_companyId_type_idx" ON "company_legal_documents"("companyId", "type");
ALTER TABLE "company_legal_documents" ADD CONSTRAINT "company_legal_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
