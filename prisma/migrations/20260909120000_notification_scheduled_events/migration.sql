CREATE TYPE "NotificationScheduleType" AS ENUM ('RELATIVE', 'OVERDUE');
CREATE TYPE "NotificationScheduleTriggerMode" AS ENUM ('BEFORE', 'AT', 'AT_OR_AFTER', 'AFTER');

CREATE TABLE "notification_schedules" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "scheduleType" "NotificationScheduleType" NOT NULL,
  "sourceField" TEXT NOT NULL,
  "offsetMinutes" INTEGER NOT NULL DEFAULT 0,
  "triggerMode" "NotificationScheduleTriggerMode" NOT NULL,
  "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 60,
  "lastEvaluatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_schedules_ruleId_key" ON "notification_schedules"("ruleId");
CREATE INDEX "notification_schedules_organizationId_enabled_idx" ON "notification_schedules"("organizationId", "enabled");
CREATE INDEX "notification_schedules_organizationId_scheduleType_enabled_idx" ON "notification_schedules"("organizationId", "scheduleType", "enabled");
CREATE INDEX IF NOT EXISTS "meetings_organizationId_status_startAt_idx" ON "meetings"("organizationId", "status", "startAt");
CREATE INDEX IF NOT EXISTS "tasks_organizationId_status_dueAt_idx" ON "tasks"("organizationId", "status", "dueAt");

ALTER TABLE "notification_schedules" ADD CONSTRAINT "notification_schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_schedules" ADD CONSTRAINT "notification_schedules_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "notification_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_schedules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_schedules_tenant_isolation" ON "notification_schedules"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));
