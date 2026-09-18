-- Turn notification deliveries into durable database-backed jobs.
ALTER TABLE "notification_deliveries"
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "processingStartedAt" TIMESTAMP(3);

-- A deployment must not strand jobs that were PROCESSING when the old process stopped.
UPDATE "notification_deliveries"
SET "status" = 'RETRYING',
    "nextAttemptAt" = CURRENT_TIMESTAMP,
    "failureCode" = 'DEPLOYMENT_RECOVERY',
    "failureMessage" = COALESCE("failureMessage", 'ارسال ناتمام برای تلاش مجدد بازیابی شد')
WHERE "status" = 'PROCESSING';

CREATE INDEX "notification_deliveries_status_nextAttemptAt_createdAt_idx"
  ON "notification_deliveries"("status", "nextAttemptAt", "createdAt");

CREATE INDEX "notification_deliveries_status_processingStartedAt_idx"
  ON "notification_deliveries"("status", "processingStartedAt");
