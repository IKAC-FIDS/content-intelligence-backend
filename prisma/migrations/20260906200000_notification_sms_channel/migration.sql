CREATE TABLE "notification_sms_settings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "apiUrl" TEXT NOT NULL,
  "apiKeyEnc" TEXT,
  "senderNumber" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_sms_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_sms_settings_organizationId_key"
  ON "notification_sms_settings"("organizationId");
CREATE INDEX "notification_sms_settings_organizationId_enabled_idx"
  ON "notification_sms_settings"("organizationId", "enabled");
ALTER TABLE "notification_sms_settings"
  ADD CONSTRAINT "notification_sms_settings_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_sms_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_sms_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_sms_settings_tenant_isolation" ON "notification_sms_settings"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));
