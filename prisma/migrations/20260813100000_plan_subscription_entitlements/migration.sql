-- fix 000092: additive commercial entitlement foundation.
CREATE TYPE "FeatureKey" AS ENUM ('SSO', 'PASSKEY', 'ADVANCED_RBAC', 'CUSTOM_DOMAINS', 'BRANDING', 'AUDIT', 'REPORTING');
CREATE TYPE "SubscriptionType" AS ENUM ('STANDARD', 'TRIAL', 'MANUAL_CONTRACT');
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "EntitlementOverrideState" AS ENUM ('ENABLED', 'DISABLED');
ALTER TABLE "organizations" ADD COLUMN "entitlementVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "plans" ("id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "revision" INTEGER NOT NULL DEFAULT 1, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "plans_pkey" PRIMARY KEY ("id"));
CREATE TABLE "plan_features" ("id" TEXT NOT NULL, "planId" TEXT NOT NULL, "feature" "FeatureKey" NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false, "value" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id"));
CREATE TABLE "subscriptions" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "planId" TEXT NOT NULL, "type" "SubscriptionType" NOT NULL, "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING', "startAt" TIMESTAMP(3) NOT NULL, "endAt" TIMESTAMP(3), "gracePeriodEndAt" TIMESTAMP(3), "contractReference" TEXT, "internalNote" TEXT, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"), CONSTRAINT "subscriptions_dates_check" CHECK ("endAt" IS NULL OR "endAt" > "startAt"), CONSTRAINT "subscriptions_grace_check" CHECK ("gracePeriodEndAt" IS NULL OR ("endAt" IS NOT NULL AND "gracePeriodEndAt" > "endAt")));
CREATE TABLE "organization_entitlements" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "feature" "FeatureKey" NOT NULL, "state" "EntitlementOverrideState" NOT NULL, "reason" TEXT, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "organization_entitlements_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");
CREATE INDEX "plans_isActive_idx" ON "plans"("isActive");
CREATE UNIQUE INDEX "plan_features_planId_feature_key" ON "plan_features"("planId", "feature");
CREATE INDEX "plan_features_feature_idx" ON "plan_features"("feature");
CREATE INDEX "subscriptions_organizationId_status_startAt_endAt_idx" ON "subscriptions"("organizationId", "status", "startAt", "endAt");
CREATE INDEX "subscriptions_planId_idx" ON "subscriptions"("planId");
CREATE UNIQUE INDEX "subscriptions_one_current_per_organization_key" ON "subscriptions"("organizationId") WHERE "status" IN ('PENDING', 'ACTIVE', 'SUSPENDED');
CREATE UNIQUE INDEX "organization_entitlements_organizationId_feature_key" ON "organization_entitlements"("organizationId", "feature");
CREATE INDEX "organization_entitlements_feature_idx" ON "organization_entitlements"("feature");
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_entitlements" ADD CONSTRAINT "organization_entitlements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
