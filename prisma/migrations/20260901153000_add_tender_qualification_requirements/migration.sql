CREATE TYPE "TenderBidDecision" AS ENUM ('UNDECIDED', 'BID', 'NO_BID');
CREATE TYPE "TenderQualificationDecision" AS ENUM ('PENDING', 'GO', 'CONDITIONAL_GO', 'NO_GO');

ALTER TABLE "technical_tenders"
  ADD COLUMN "bidDecision" "TenderBidDecision" NOT NULL DEFAULT 'UNDECIDED',
  ADD COLUMN "qualificationDecision" "TenderQualificationDecision" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "fitScore" INTEGER,
  ADD COLUMN "riskScore" INTEGER,
  ADD COLUMN "feasibilityScore" INTEGER,
  ADD COLUMN "fitNotes" TEXT,
  ADD COLUMN "riskNotes" TEXT,
  ADD COLUMN "feasibilityNotes" TEXT,
  ADD COLUMN "qualificationSummary" TEXT,
  ADD COLUMN "qualificationConditions" TEXT,
  ADD COLUMN "decisionReason" TEXT;

ALTER TABLE "tender_requirements"
  ADD COLUMN "section" TEXT,
  ADD COLUMN "page" TEXT,
  ADD COLUMN "referenceId" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "parentRequirementId" TEXT,
  ADD COLUMN "taskId" TEXT;

CREATE TABLE "tender_requirement_dependencies" (
  "id" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "dependsOnRequirementId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tender_requirement_dependencies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tender_requirements_organizationId_parentRequirementId_idx" ON "tender_requirements"("organizationId", "parentRequirementId");
CREATE INDEX "tender_requirements_organizationId_ownerId_idx" ON "tender_requirements"("organizationId", "ownerId");
CREATE INDEX "tender_requirements_organizationId_taskId_idx" ON "tender_requirements"("organizationId", "taskId");
CREATE UNIQUE INDEX "tender_requirements_organizationId_tenderId_referenceId_key" ON "tender_requirements"("organizationId", "tenderId", "referenceId");
CREATE UNIQUE INDEX "tender_requirement_dependencies_requirementId_dependsOnRequirementId_key" ON "tender_requirement_dependencies"("requirementId", "dependsOnRequirementId");
CREATE INDEX "tender_requirement_dependencies_dependsOnRequirementId_idx" ON "tender_requirement_dependencies"("dependsOnRequirementId");

ALTER TABLE "tender_requirements" ADD CONSTRAINT "tender_requirements_parentRequirementId_fkey" FOREIGN KEY ("parentRequirementId") REFERENCES "tender_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tender_requirements" ADD CONSTRAINT "tender_requirements_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tender_requirement_dependencies" ADD CONSTRAINT "tender_requirement_dependencies_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "tender_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tender_requirement_dependencies" ADD CONSTRAINT "tender_requirement_dependencies_dependsOnRequirementId_fkey" FOREIGN KEY ("dependsOnRequirementId") REFERENCES "tender_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "technical_tenders" ADD CONSTRAINT "technical_tenders_fitScore_check" CHECK ("fitScore" IS NULL OR ("fitScore" BETWEEN 0 AND 100));
ALTER TABLE "technical_tenders" ADD CONSTRAINT "technical_tenders_riskScore_check" CHECK ("riskScore" IS NULL OR ("riskScore" BETWEEN 0 AND 100));
ALTER TABLE "technical_tenders" ADD CONSTRAINT "technical_tenders_feasibilityScore_check" CHECK ("feasibilityScore" IS NULL OR ("feasibilityScore" BETWEEN 0 AND 100));
