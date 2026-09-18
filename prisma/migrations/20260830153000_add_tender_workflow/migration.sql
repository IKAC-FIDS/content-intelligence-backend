CREATE TYPE "TenderReviewType" AS ENUM ('TECHNICAL', 'COMMERCIAL');
CREATE TYPE "TenderReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
ALTER TYPE "NotificationType" ADD VALUE 'TENDER_WORKFLOW';
ALTER TYPE "NotificationEntityType" ADD VALUE 'TENDER';

ALTER TABLE "technical_tenders"
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "submittedById" TEXT,
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "closedById" TEXT;

ALTER TABLE "tender_requirements"
  ADD COLUMN "blockedReason" TEXT,
  ADD COLUMN "blockedAt" TIMESTAMP(3),
  ADD COLUMN "blockedById" TEXT;

ALTER TABLE "tender_deliverables"
  ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "tender_reviews" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tenderId" TEXT NOT NULL,
  "type" "TenderReviewType" NOT NULL,
  "status" "TenderReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewerId" TEXT,
  "requestedById" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tender_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tender_reviews_organizationId_tenderId_type_createdAt_idx" ON "tender_reviews"("organizationId", "tenderId", "type", "createdAt");
CREATE INDEX "tender_reviews_organizationId_reviewerId_status_idx" ON "tender_reviews"("organizationId", "reviewerId", "status");

ALTER TABLE "technical_tenders" ADD CONSTRAINT "technical_tenders_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technical_tenders" ADD CONSTRAINT "technical_tenders_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tender_requirements" ADD CONSTRAINT "tender_requirements_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tender_reviews" ADD CONSTRAINT "tender_reviews_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tender_reviews" ADD CONSTRAINT "tender_reviews_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "technical_tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tender_reviews" ADD CONSTRAINT "tender_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tender_reviews" ADD CONSTRAINT "tender_reviews_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tender_reviews" ADD CONSTRAINT "tender_reviews_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "action", "description", "name", "group", "isSystem", "isActive", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'technical-tender:review-technical', 'Review technical tender content', 'Review technical tender content', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'technical-tender:review-commercial', 'Review technical tender commercials', 'Review technical tender commercials', 'Technical center', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("action") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, r."baseRole", r."id", p."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" IN ('ADMIN', 'MANAGER') AND r."isSystem" = true
  AND p."action" IN ('technical-tender:review-technical', 'technical-tender:review-commercial')
ON CONFLICT DO NOTHING;
