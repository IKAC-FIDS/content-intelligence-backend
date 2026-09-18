-- Notification Core Phase 1
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH', 'IN_APP');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'RETRYING', 'SKIPPED');
CREATE TYPE "NotificationRecipientType" AS ENUM ('USER', 'ROLE', 'TEAM', 'ASSIGNEE', 'OWNER', 'CREATOR', 'MANAGER');

CREATE TABLE "notification_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "actorId" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "idempotencyKey" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_rules" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "mandatory" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "conditions" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_recipient_rules" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "type" "NotificationRecipientType" NOT NULL,
  "targetId" TEXT,
  "channels" "NotificationChannel"[],
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_recipient_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_templates" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'fa-IR',
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_deliveries" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "ruleId" TEXT,
  "recipientRuleId" TEXT,
  "recipientUserId" TEXT,
  "templateId" TEXT,
  "channel" "NotificationChannel" NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "destination" TEXT,
  "deduplicationKey" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "providerMessageId" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_preferences" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_events_organizationId_idempotencyKey_key" ON "notification_events"("organizationId", "idempotencyKey");
CREATE INDEX "notification_events_organizationId_eventName_occurredAt_idx" ON "notification_events"("organizationId", "eventName", "occurredAt");
CREATE INDEX "notification_events_aggregateType_aggregateId_idx" ON "notification_events"("aggregateType", "aggregateId");
CREATE INDEX "notification_events_actorId_idx" ON "notification_events"("actorId");
CREATE INDEX "notification_rules_organizationId_eventName_enabled_idx" ON "notification_rules"("organizationId", "eventName", "enabled");
CREATE INDEX "notification_recipient_rules_ruleId_enabled_idx" ON "notification_recipient_rules"("ruleId", "enabled");
CREATE INDEX "notification_recipient_rules_type_targetId_idx" ON "notification_recipient_rules"("type", "targetId");
CREATE UNIQUE INDEX "notification_templates_organizationId_eventName_channel_locale_version_key" ON "notification_templates"("organizationId", "eventName", "channel", "locale", "version");
CREATE INDEX "notification_templates_organizationId_eventName_channel_isActive_idx" ON "notification_templates"("organizationId", "eventName", "channel", "isActive");
CREATE UNIQUE INDEX "notification_deliveries_deduplicationKey_key" ON "notification_deliveries"("deduplicationKey");
CREATE INDEX "notification_deliveries_eventId_idx" ON "notification_deliveries"("eventId");
CREATE INDEX "notification_deliveries_ruleId_idx" ON "notification_deliveries"("ruleId");
CREATE INDEX "notification_deliveries_recipientUserId_status_createdAt_idx" ON "notification_deliveries"("recipientUserId", "status", "createdAt");
CREATE INDEX "notification_deliveries_channel_status_createdAt_idx" ON "notification_deliveries"("channel", "status", "createdAt");
CREATE UNIQUE INDEX "notification_preferences_organizationId_userId_eventName_channel_key" ON "notification_preferences"("organizationId", "userId", "eventName", "channel");
CREATE INDEX "notification_preferences_userId_eventName_idx" ON "notification_preferences"("userId", "eventName");

ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_recipient_rules" ADD CONSTRAINT "notification_recipient_rules_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "notification_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "notification_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "notification_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_recipientRuleId_fkey" FOREIGN KEY ("recipientRuleId") REFERENCES "notification_recipient_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Notification Core Phase 1.1 RLS
-- Tenant context key discovered from: prisma\migrations\20260810170000_add_notification_rls\migration.sql
-- Fail-closed behavior: when the tenant context is unset, current_setting(..., true)
-- returns NULL and the policy predicate does not match any organization row.

ALTER TABLE "notification_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_events_tenant_isolation" ON "notification_events"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "notification_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_rules_tenant_isolation" ON "notification_rules"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "notification_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_templates_tenant_isolation" ON "notification_templates"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_preferences_tenant_isolation" ON "notification_preferences"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "notification_recipient_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_recipient_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_recipient_rules_tenant_isolation" ON "notification_recipient_rules"
  USING (EXISTS (
    SELECT 1 FROM "notification_rules" nr
    WHERE nr."id" = "notification_recipient_rules"."ruleId"
      AND nr."organizationId" = current_setting('app.current_organization_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "notification_rules" nr
    WHERE nr."id" = "notification_recipient_rules"."ruleId"
      AND nr."organizationId" = current_setting('app.current_organization_id', true)
  ));

ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_deliveries_tenant_isolation" ON "notification_deliveries"
  USING (EXISTS (
    SELECT 1 FROM "notification_events" ne
    WHERE ne."id" = "notification_deliveries"."eventId"
      AND ne."organizationId" = current_setting('app.current_organization_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "notification_events" ne
    WHERE ne."id" = "notification_deliveries"."eventId"
      AND ne."organizationId" = current_setting('app.current_organization_id', true)
  ));
