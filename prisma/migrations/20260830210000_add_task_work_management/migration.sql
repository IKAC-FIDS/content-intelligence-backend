-- Phase 4.4 adds organization-wide assignment, hierarchy and validated entity links.
CREATE TYPE "TaskAssignmentScope" AS ENUM ('SELF', 'TEAM', 'ORGANIZATION');

ALTER TABLE "tasks"
  ADD COLUMN "assignmentScope" "TaskAssignmentScope" NOT NULL DEFAULT 'SELF',
  ADD COLUMN "teamId" TEXT,
  ADD COLUMN "parentTaskId" TEXT,
  ADD COLUMN "meetingId" TEXT,
  ADD COLUMN "activityId" TEXT,
  ADD COLUMN "productId" TEXT;

-- Existing tasks assigned to their creator retain SELF semantics. Tasks assigned
-- to somebody else (or deliberately left unassigned) become organization-scoped;
-- no historical team context is guessed during the backfill.
UPDATE "tasks"
SET "assignmentScope" = 'ORGANIZATION'
WHERE "assignedToId" IS NULL
   OR "createdById" IS NULL
   OR "assignedToId" <> "createdById";

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tasks_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tasks_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tasks_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tasks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tasks_teamId_idx" ON "tasks"("teamId");
CREATE INDEX "tasks_parentTaskId_idx" ON "tasks"("parentTaskId");
CREATE INDEX "tasks_meetingId_idx" ON "tasks"("meetingId");
CREATE INDEX "tasks_activityId_idx" ON "tasks"("activityId");
CREATE INDEX "tasks_productId_idx" ON "tasks"("productId");
CREATE INDEX "tasks_organizationId_assignmentScope_status_dueAt_idx" ON "tasks"("organizationId", "assignmentScope", "status", "dueAt");
CREATE INDEX "tasks_organizationId_teamId_status_dueAt_idx" ON "tasks"("organizationId", "teamId", "status", "dueAt");
