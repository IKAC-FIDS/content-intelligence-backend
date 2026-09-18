ALTER TYPE "NotificationPriority" ADD VALUE IF NOT EXISTS 'CRITICAL';

CREATE TYPE "NotificationQuietHoursMode" AS ENUM ('SUPPRESS', 'DEFER');
CREATE TYPE "NotificationDigestFrequency" AS ENUM ('DAILY');
CREATE TYPE "NotificationDigestBucketStatus" AS ENUM ('OPEN', 'PROCESSING', 'SENT', 'FAILED');
CREATE TYPE "NotificationEscalationRunStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'CANCELLED_RESOLVED', 'FAILED');

ALTER TABLE "notification_rules"
  ADD COLUMN "deliveryPriority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "digestPolicyId" TEXT;

ALTER TABLE "notification_deliveries"
  ADD COLUMN "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "orchestrationReason" TEXT,
  ADD COLUMN "deferredUntil" TIMESTAMP(3),
  ADD COLUMN "digestBucketId" TEXT,
  ADD COLUMN "escalationRunId" TEXT;

CREATE TABLE "notification_quiet_hours_policies" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false,
  "startTime" TEXT NOT NULL DEFAULT '22:00', "endTime" TEXT NOT NULL DEFAULT '07:00',
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Tehran', "channels" "NotificationChannel"[],
  "allowCritical" BOOLEAN NOT NULL DEFAULT true, "mode" "NotificationQuietHoursMode" NOT NULL DEFAULT 'DEFER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_quiet_hours_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_quiet_hours_policies_organizationId_key" ON "notification_quiet_hours_policies"("organizationId");
CREATE INDEX "notification_quiet_hours_policies_organizationId_enabled_idx" ON "notification_quiet_hours_policies"("organizationId", "enabled");

CREATE TABLE "notification_digest_policies" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "name" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "frequency" "NotificationDigestFrequency" NOT NULL DEFAULT 'DAILY', "sendTime" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Tehran', "subjectTemplate" TEXT NOT NULL DEFAULT 'خلاصه اعلان‌های روزانه',
  "introText" TEXT NOT NULL DEFAULT 'خلاصه اعلان‌های شما:', "eventNames" TEXT[], "channels" "NotificationChannel"[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_digest_policies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notification_digest_policies_organizationId_enabled_idx" ON "notification_digest_policies"("organizationId", "enabled");

CREATE TABLE "notification_digest_buckets" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "policyId" TEXT NOT NULL, "recipientUserId" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL, "windowStart" TIMESTAMP(3) NOT NULL, "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "NotificationDigestBucketStatus" NOT NULL DEFAULT 'OPEN', "carrierDeliveryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_digest_buckets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_digest_buckets_carrierDeliveryId_key" ON "notification_digest_buckets"("carrierDeliveryId");
CREATE UNIQUE INDEX "notification_digest_buckets_identity_key" ON "notification_digest_buckets"("organizationId", "policyId", "recipientUserId", "channel", "windowStart");
CREATE INDEX "notification_digest_buckets_organizationId_status_scheduledFor_idx" ON "notification_digest_buckets"("organizationId", "status", "scheduledFor");

CREATE TABLE "notification_digest_items" (
  "id" TEXT NOT NULL, "bucketId" TEXT NOT NULL, "deliveryId" TEXT NOT NULL, "eventId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_digest_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_digest_items_deliveryId_key" ON "notification_digest_items"("deliveryId");
CREATE INDEX "notification_digest_items_bucketId_createdAt_idx" ON "notification_digest_items"("bucketId", "createdAt");

CREATE TABLE "notification_escalation_policies" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "name" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "eventName" TEXT NOT NULL, "aggregateType" TEXT NOT NULL DEFAULT 'TASK', "conditions" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_escalation_policies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notification_escalation_policies_organizationId_eventName_enabled_idx" ON "notification_escalation_policies"("organizationId", "eventName", "enabled");

CREATE TABLE "notification_escalation_steps" (
  "id" TEXT NOT NULL, "policyId" TEXT NOT NULL, "stepOrder" INTEGER NOT NULL, "delayMinutes" INTEGER NOT NULL,
  "recipientType" "NotificationRecipientType" NOT NULL, "targetId" TEXT, "channels" "NotificationChannel"[],
  "priority" "NotificationPriority" NOT NULL DEFAULT 'HIGH', "mandatory" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_escalation_steps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_escalation_steps_policyId_stepOrder_key" ON "notification_escalation_steps"("policyId", "stepOrder");
CREATE INDEX "notification_escalation_steps_policyId_delayMinutes_idx" ON "notification_escalation_steps"("policyId", "delayMinutes");

CREATE TABLE "notification_escalation_runs" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "policyId" TEXT NOT NULL, "stepId" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL, "aggregateType" TEXT NOT NULL, "aggregateId" TEXT NOT NULL, "sourceDueAt" TIMESTAMP(3),
  "scheduledFor" TIMESTAMP(3) NOT NULL, "status" "NotificationEscalationRunStatus" NOT NULL DEFAULT 'PENDING',
  "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_escalation_runs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_escalation_runs_identity_key" ON "notification_escalation_runs"("organizationId", "sourceEventId", "stepId");
CREATE INDEX "notification_escalation_runs_organizationId_status_scheduledFor_idx" ON "notification_escalation_runs"("organizationId", "status", "scheduledFor");
CREATE INDEX "notification_escalation_runs_aggregateType_aggregateId_idx" ON "notification_escalation_runs"("aggregateType", "aggregateId");

ALTER TABLE "notification_quiet_hours_policies" ADD CONSTRAINT "notification_quiet_hours_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_digest_policies" ADD CONSTRAINT "notification_digest_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_digest_buckets" ADD CONSTRAINT "notification_digest_buckets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_digest_buckets" ADD CONSTRAINT "notification_digest_buckets_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "notification_digest_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_digest_items" ADD CONSTRAINT "notification_digest_items_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "notification_digest_buckets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_escalation_policies" ADD CONSTRAINT "notification_escalation_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_escalation_steps" ADD CONSTRAINT "notification_escalation_steps_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "notification_escalation_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_escalation_runs" ADD CONSTRAINT "notification_escalation_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_escalation_runs" ADD CONSTRAINT "notification_escalation_runs_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "notification_escalation_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_escalation_runs" ADD CONSTRAINT "notification_escalation_runs_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "notification_escalation_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_digestPolicyId_fkey" FOREIGN KEY ("digestPolicyId") REFERENCES "notification_digest_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_digestBucketId_fkey" FOREIGN KEY ("digestBucketId") REFERENCES "notification_digest_buckets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_escalationRunId_fkey" FOREIGN KEY ("escalationRunId") REFERENCES "notification_escalation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "notification_rules_digestPolicyId_idx" ON "notification_rules"("digestPolicyId");
CREATE INDEX "notification_deliveries_organizationId_deferredUntil_idx" ON "notification_deliveries"("organizationId", "deferredUntil");
CREATE INDEX "notification_deliveries_digestBucketId_idx" ON "notification_deliveries"("digestBucketId");
CREATE INDEX "notification_deliveries_escalationRunId_idx" ON "notification_deliveries"("escalationRunId");

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['notification_quiet_hours_policies','notification_digest_policies','notification_digest_buckets','notification_escalation_policies','notification_escalation_runs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING ("organizationId" = current_setting(''app.current_organization_id'', true)) WITH CHECK ("organizationId" = current_setting(''app.current_organization_id'', true))', table_name || '_tenant_isolation', table_name);
  END LOOP;
END $$;

ALTER TABLE "notification_digest_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_digest_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_digest_items_tenant_isolation" ON "notification_digest_items" USING (EXISTS (SELECT 1 FROM "notification_digest_buckets" b WHERE b."id" = "notification_digest_items"."bucketId" AND b."organizationId" = current_setting('app.current_organization_id', true))) WITH CHECK (EXISTS (SELECT 1 FROM "notification_digest_buckets" b WHERE b."id" = "notification_digest_items"."bucketId" AND b."organizationId" = current_setting('app.current_organization_id', true)));
ALTER TABLE "notification_escalation_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_escalation_steps" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_escalation_steps_tenant_isolation" ON "notification_escalation_steps" USING (EXISTS (SELECT 1 FROM "notification_escalation_policies" p WHERE p."id" = "notification_escalation_steps"."policyId" AND p."organizationId" = current_setting('app.current_organization_id', true))) WITH CHECK (EXISTS (SELECT 1 FROM "notification_escalation_policies" p WHERE p."id" = "notification_escalation_steps"."policyId" AND p."organizationId" = current_setting('app.current_organization_id', true)));
