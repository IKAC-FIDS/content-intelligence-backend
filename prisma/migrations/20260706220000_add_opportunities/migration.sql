CREATE TABLE "opportunities" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "ownerId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "stage" "PipelineStage" NOT NULL DEFAULT 'LEAD',
  "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
  "estimatedValue" DECIMAL(18,2),
  "expectedCloseDate" TIMESTAMP(3),
  "source" TEXT,
  "lostReason" TEXT,
  "wonAt" TIMESTAMP(3),
  "lostAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "archivedById" TEXT,
  "archiveReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opportunity_stage_histories" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "fromStage" "PipelineStage",
  "toStage" "PipelineStage" NOT NULL,
  "changedById" TEXT,
  "note" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "opportunity_stage_histories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "activities" ADD COLUMN "opportunityId" TEXT;

CREATE INDEX "opportunities_companyId_idx" ON "opportunities"("companyId");
CREATE INDEX "opportunities_ownerId_idx" ON "opportunities"("ownerId");
CREATE INDEX "opportunities_stage_idx" ON "opportunities"("stage");
CREATE INDEX "opportunities_priority_idx" ON "opportunities"("priority");
CREATE INDEX "opportunities_archivedAt_idx" ON "opportunities"("archivedAt");
CREATE INDEX "opportunities_ownerId_stage_idx" ON "opportunities"("ownerId", "stage");
CREATE INDEX "opportunity_stage_histories_opportunityId_idx" ON "opportunity_stage_histories"("opportunityId");
CREATE INDEX "opportunity_stage_histories_toStage_idx" ON "opportunity_stage_histories"("toStage");
CREATE INDEX "opportunity_stage_histories_changedAt_idx" ON "opportunity_stage_histories"("changedAt");
CREATE INDEX "opportunity_stage_histories_opportunityId_changedAt_idx" ON "opportunity_stage_histories"("opportunityId", "changedAt");
CREATE INDEX "activities_opportunityId_idx" ON "activities"("opportunityId");

ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "opportunity_stage_histories" ADD CONSTRAINT "opportunity_stage_histories_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opportunity_stage_histories" ADD CONSTRAINT "opportunity_stage_histories_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activities" ADD CONSTRAINT "activities_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase 1 backfill: preserve Company pipeline fields and create one primary opportunity.
INSERT INTO "opportunities" (
  "id", "companyId", "ownerId", "title", "stage", "priority", "source", "wonAt", "lostAt", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  c."id",
  c."ownerId",
  'Primary sales opportunity',
  c."stage",
  c."priority",
  c."source",
  CASE WHEN c."stage" = 'DONE' THEN CURRENT_TIMESTAMP ELSE NULL END,
  CASE WHEN c."stage" IN ('LOST', 'NO_RESPONSE') THEN CURRENT_TIMESTAMP ELSE NULL END,
  c."createdAt",
  c."updatedAt"
FROM "companies" c;

INSERT INTO "opportunity_stage_histories" ("id", "opportunityId", "fromStage", "toStage", "changedAt")
SELECT gen_random_uuid()::text, o."id", NULL, o."stage", o."createdAt"
FROM "opportunities" o;
