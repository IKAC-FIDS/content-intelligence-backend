-- Phase 4.6 adds an opt-in task review lifecycle. Existing tasks remain
-- NOT_REQUIRED and keep their current completion behavior.
CREATE TYPE "TaskReviewStatus" AS ENUM ('NOT_REQUIRED', 'DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED');
CREATE TYPE "TaskReviewDecision" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'CANCELLED');

ALTER TABLE "tasks"
  ADD COLUMN "requiresReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reviewStatus" "TaskReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "reviewerId" TEXT;

-- Clear impossible legacy references defensively before the FK is introduced.
UPDATE "tasks" SET "reviewerId" = NULL
WHERE "reviewerId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."id" = "tasks"."reviewerId");

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "task_review_rounds" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "roundNumber" INTEGER NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submissionNote" TEXT,
  "decision" "TaskReviewDecision" NOT NULL DEFAULT 'PENDING',
  "reviewedAt" TIMESTAMP(3),
  "reviewComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "task_review_rounds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_review_artifacts" (
  "id" TEXT NOT NULL,
  "reviewRoundId" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "addedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_review_artifacts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "task_review_rounds"
  ADD CONSTRAINT "task_review_rounds_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "task_review_rounds_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "task_review_rounds_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "task_review_rounds_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_review_artifacts"
  ADD CONSTRAINT "task_review_artifacts_reviewRoundId_fkey" FOREIGN KEY ("reviewRoundId") REFERENCES "task_review_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "task_review_artifacts_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "file_attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "task_review_artifacts_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "task_review_rounds_taskId_roundNumber_key" ON "task_review_rounds"("taskId", "roundNumber");
CREATE INDEX "task_review_rounds_organizationId_reviewerId_decision_submittedAt_idx" ON "task_review_rounds"("organizationId", "reviewerId", "decision", "submittedAt");
CREATE INDEX "task_review_rounds_taskId_submittedAt_idx" ON "task_review_rounds"("taskId", "submittedAt");
CREATE UNIQUE INDEX "task_review_artifacts_reviewRoundId_artifactId_key" ON "task_review_artifacts"("reviewRoundId", "artifactId");
CREATE INDEX "task_review_artifacts_artifactId_idx" ON "task_review_artifacts"("artifactId");
CREATE INDEX "tasks_organizationId_reviewStatus_reviewerId_idx" ON "tasks"("organizationId", "reviewStatus", "reviewerId");
CREATE INDEX "tasks_reviewerId_idx" ON "tasks"("reviewerId");

-- Existing deployments need the review permissions during migrate deploy; seed is
-- retained for fresh installations but is not required for this upgrade path.
INSERT INTO "permissions" ("id", "action", "description", "name", "group", "isSystem", "isActive", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'task:submit-review', 'Submit accessible tasks for review', 'Submit task for review', 'Tasks', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'task:review', 'Review assigned task submissions', 'Review task submissions', 'Tasks', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'task:assign-reviewer', 'Assign or change a task reviewer', 'Assign task reviewer', 'Tasks', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("action") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, r."baseRole", r."id", p."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" IN ('ADMIN', 'MANAGER') AND r."isSystem" = true
  AND p."action" IN ('task:submit-review', 'task:review', 'task:assign-reviewer')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("id", "role", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, r."baseRole", r."id", p."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" = 'REP' AND r."isSystem" = true
  AND p."action" IN ('task:submit-review', 'task:review')
ON CONFLICT DO NOTHING;
