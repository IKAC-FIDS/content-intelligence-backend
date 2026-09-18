-- fix 000093: additive quota configuration, usage metering, reservations and snapshots.
CREATE TYPE "QuotaMetric" AS ENUM ('ACTIVE_USERS', 'COMPANIES', 'OPPORTUNITIES', 'FILES', 'STORAGE_BYTES', 'API_CALLS', 'WORKFLOW_RUNS', 'WEBHOOK_DELIVERIES', 'EMAIL_SENDS', 'AI_REQUESTS');
CREATE TYPE "QuotaResetPeriod" AS ENUM ('NONE', 'DAILY', 'MONTHLY', 'SUBSCRIPTION_TERM');
CREATE TYPE "UsageReservationStatus" AS ENUM ('RESERVED', 'COMMITTED', 'RELEASED', 'EXPIRED');

CREATE TABLE "plan_quotas" (
  "id" TEXT NOT NULL, "planId" TEXT NOT NULL, "metric" "QuotaMetric" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false, "isUnlimited" BOOLEAN NOT NULL DEFAULT false,
  "softLimit" BIGINT, "hardLimit" BIGINT, "resetPeriod" "QuotaResetPeriod" NOT NULL DEFAULT 'MONTHLY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plan_quotas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plan_quotas_non_negative_check" CHECK (("softLimit" IS NULL OR "softLimit" >= 0) AND ("hardLimit" IS NULL OR "hardLimit" >= 0)),
  CONSTRAINT "plan_quotas_limit_order_check" CHECK ("softLimit" IS NULL OR "hardLimit" IS NULL OR "softLimit" <= "hardLimit"),
  CONSTRAINT "plan_quotas_unlimited_check" CHECK (NOT "isUnlimited" OR ("softLimit" IS NULL AND "hardLimit" IS NULL))
);
CREATE TABLE "organization_quota_overrides" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "metric" "QuotaMetric" NOT NULL,
  "enabled" BOOLEAN, "isUnlimited" BOOLEAN, "softLimit" BIGINT, "hardLimit" BIGINT, "resetPeriod" "QuotaResetPeriod",
  "reason" TEXT, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_quota_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_quota_overrides_non_negative_check" CHECK (("softLimit" IS NULL OR "softLimit" >= 0) AND ("hardLimit" IS NULL OR "hardLimit" >= 0)),
  CONSTRAINT "organization_quota_overrides_limit_order_check" CHECK ("softLimit" IS NULL OR "hardLimit" IS NULL OR "softLimit" <= "hardLimit"),
  CONSTRAINT "organization_quota_overrides_unlimited_check" CHECK ("isUnlimited" IS DISTINCT FROM true OR ("softLimit" IS NULL AND "hardLimit" IS NULL))
);
CREATE TABLE "usage_counters" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "metric" "QuotaMetric" NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3), "currentValue" BIGINT NOT NULL DEFAULT 0,
  "effectiveSoftLimit" BIGINT, "effectiveHardLimit" BIGINT, "resetPeriod" "QuotaResetPeriod" NOT NULL,
  "configurationState" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "usage_counters_non_negative_check" CHECK ("currentValue" >= 0),
  CONSTRAINT "usage_counters_period_check" CHECK ("periodEnd" IS NULL OR "periodEnd" > "periodStart"),
  CONSTRAINT "usage_counters_limit_order_check" CHECK ("effectiveSoftLimit" IS NULL OR "effectiveHardLimit" IS NULL OR "effectiveSoftLimit" <= "effectiveHardLimit")
);
CREATE TABLE "usage_snapshots" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "metric" "QuotaMetric" NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3), "finalUsage" BIGINT NOT NULL,
  "softLimit" BIGINT, "hardLimit" BIGINT, "percentageBasisPts" INTEGER, "exceeded" BOOLEAN NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usage_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "usage_snapshots_non_negative_check" CHECK ("finalUsage" >= 0),
  CONSTRAINT "usage_snapshots_period_check" CHECK ("periodEnd" IS NULL OR "periodEnd" > "periodStart")
);
CREATE TABLE "quota_threshold_events" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "metric" "QuotaMetric" NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL, "threshold" INTEGER NOT NULL, "usageValue" BIGINT NOT NULL,
  "limitValue" BIGINT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quota_threshold_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quota_threshold_events_threshold_check" CHECK ("threshold" IN (80, 90))
);
CREATE TABLE "usage_reservations" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "counterId" TEXT NOT NULL, "metric" "QuotaMetric" NOT NULL,
  "idempotencyKey" TEXT NOT NULL, "amount" BIGINT NOT NULL, "status" "UsageReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "expiresAt" TIMESTAMP(3), "committedAt" TIMESTAMP(3), "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "usage_reservations_pkey" PRIMARY KEY ("id"), CONSTRAINT "usage_reservations_amount_check" CHECK ("amount" > 0)
);
CREATE TABLE "usage_events" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "metric" "QuotaMetric" NOT NULL,
  "idempotencyKey" TEXT NOT NULL, "amount" BIGINT NOT NULL, "periodStart" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id"), CONSTRAINT "usage_events_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "plan_quotas_planId_metric_key" ON "plan_quotas"("planId", "metric");
CREATE INDEX "plan_quotas_metric_idx" ON "plan_quotas"("metric");
CREATE UNIQUE INDEX "organization_quota_overrides_organizationId_metric_key" ON "organization_quota_overrides"("organizationId", "metric");
CREATE INDEX "organization_quota_overrides_metric_idx" ON "organization_quota_overrides"("metric");
CREATE UNIQUE INDEX "usage_counters_organizationId_metric_periodStart_key" ON "usage_counters"("organizationId", "metric", "periodStart");
CREATE INDEX "usage_counters_organizationId_metric_periodEnd_idx" ON "usage_counters"("organizationId", "metric", "periodEnd");
CREATE UNIQUE INDEX "usage_snapshots_organizationId_metric_periodStart_key" ON "usage_snapshots"("organizationId", "metric", "periodStart");
CREATE INDEX "usage_snapshots_organizationId_capturedAt_idx" ON "usage_snapshots"("organizationId", "capturedAt");
CREATE UNIQUE INDEX "quota_threshold_events_organizationId_metric_periodStart_threshold_key" ON "quota_threshold_events"("organizationId", "metric", "periodStart", "threshold");
CREATE INDEX "quota_threshold_events_organizationId_createdAt_idx" ON "quota_threshold_events"("organizationId", "createdAt");
CREATE UNIQUE INDEX "usage_reservations_organizationId_metric_idempotencyKey_key" ON "usage_reservations"("organizationId", "metric", "idempotencyKey");
CREATE INDEX "usage_reservations_organizationId_status_expiresAt_idx" ON "usage_reservations"("organizationId", "status", "expiresAt");
CREATE UNIQUE INDEX "usage_events_organizationId_metric_idempotencyKey_key" ON "usage_events"("organizationId", "metric", "idempotencyKey");
CREATE INDEX "usage_events_organizationId_metric_periodStart_idx" ON "usage_events"("organizationId", "metric", "periodStart");

ALTER TABLE "plan_quotas" ADD CONSTRAINT "plan_quotas_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_quota_overrides" ADD CONSTRAINT "organization_quota_overrides_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usage_snapshots" ADD CONSTRAINT "usage_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quota_threshold_events" ADD CONSTRAINT "quota_threshold_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "usage_counters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
