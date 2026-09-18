CREATE TYPE "NotificationTriggerType" AS ENUM ('DOMAIN_EVENT', 'SCHEDULED', 'MANUAL_RETRY', 'AUTOMATIC_RETRY', 'SYSTEM');
CREATE TYPE "NotificationFailureCategory" AS ENUM ('NETWORK', 'AUTHENTICATION', 'PROVIDER_REJECTED', 'INVALID_DESTINATION', 'TEMPLATE_ERROR', 'RATE_LIMIT', 'TIMEOUT', 'CONFIGURATION', 'UNKNOWN');

ALTER TABLE "notification_deliveries"
  ADD COLUMN "retryRequestedAt" TIMESTAMP(3),
  ADD COLUMN "retryRequestedById" TEXT;

CREATE TABLE "notification_delivery_attempts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "triggerType" "NotificationTriggerType" NOT NULL,
  "triggeredByUserId" TEXT,
  "status" "NotificationDeliveryStatus" NOT NULL,
  "provider" TEXT,
  "providerMessageId" TEXT,
  "failureCategory" "NotificationFailureCategory",
  "failureCode" TEXT,
  "failureReason" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_delivery_attempts_deliveryId_attemptNumber_key" ON "notification_delivery_attempts"("deliveryId", "attemptNumber");
CREATE INDEX "notification_delivery_attempts_organizationId_createdAt_idx" ON "notification_delivery_attempts"("organizationId", "createdAt");
CREATE INDEX "notification_delivery_attempts_organizationId_deliveryId_createdAt_idx" ON "notification_delivery_attempts"("organizationId", "deliveryId", "createdAt");
CREATE INDEX "notification_delivery_attempts_triggeredByUserId_idx" ON "notification_delivery_attempts"("triggeredByUserId");
CREATE INDEX "notification_deliveries_retryRequestedById_idx" ON "notification_deliveries"("retryRequestedById");

ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_delivery_attempts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_delivery_attempts_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "notification_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_delivery_attempts_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_retryRequestedById_fkey" FOREIGN KEY ("retryRequestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notification_delivery_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_delivery_attempts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_delivery_attempts_tenant_isolation" ON "notification_delivery_attempts"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));
