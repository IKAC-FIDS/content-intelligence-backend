CREATE TYPE "ActivityTargetType" AS ENUM ('COMPANY', 'TASK');

ALTER TABLE "activities"
  ADD COLUMN "targetType" "ActivityTargetType" NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN "taskId" TEXT,
  ALTER COLUMN "companyId" DROP NOT NULL;

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "activities_targetType_idx" ON "activities"("targetType");
CREATE INDEX "activities_taskId_idx" ON "activities"("taskId");
CREATE INDEX "activities_taskId_occurredAt_idx" ON "activities"("taskId", "occurredAt");

-- Existing activities stay COMPANY-targeted.
-- The legacy Task.activityId relation remains in place for backward compatibility.
