CREATE TYPE "NotificationPushEndpointType" AS ENUM ('WEB', 'ANDROID', 'IOS', 'OTHER');

CREATE TABLE "notification_push_settings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'WEB_PUSH',
  "publicKey" TEXT,
  "privateKeyEnc" TEXT,
  "subject" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_push_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_push_endpoints" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'WEB_PUSH',
  "endpointType" "NotificationPushEndpointType" NOT NULL DEFAULT 'WEB',
  "externalEndpointId" TEXT NOT NULL,
  "endpointEnc" TEXT NOT NULL,
  "metadata" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_push_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_push_settings_organizationId_key" ON "notification_push_settings"("organizationId");
CREATE INDEX "notification_push_settings_organizationId_enabled_idx" ON "notification_push_settings"("organizationId", "enabled");
CREATE UNIQUE INDEX "notification_push_endpoints_organizationId_provider_externalEndpointId_key" ON "notification_push_endpoints"("organizationId", "provider", "externalEndpointId");
CREATE INDEX "notification_push_endpoints_organizationId_idx" ON "notification_push_endpoints"("organizationId");
CREATE INDEX "notification_push_endpoints_organizationId_userId_provider_active_idx" ON "notification_push_endpoints"("organizationId", "userId", "provider", "active");

ALTER TABLE "notification_push_settings" ADD CONSTRAINT "notification_push_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_push_endpoints" ADD CONSTRAINT "notification_push_endpoints_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_push_endpoints" ADD CONSTRAINT "notification_push_endpoints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_push_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_push_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_push_settings_tenant_isolation" ON "notification_push_settings"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "notification_push_endpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_push_endpoints" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_push_endpoints_tenant_isolation" ON "notification_push_endpoints"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));
