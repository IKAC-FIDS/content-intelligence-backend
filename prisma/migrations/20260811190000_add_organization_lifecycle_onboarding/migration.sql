-- fix 000089: additive Organization lifecycle, onboarding, and Tenant Owner state.
-- Existing Organizations remain ACTIVE and no Membership is guessed/promoted.

ALTER TYPE "OrganizationStatus" ADD VALUE IF NOT EXISTS 'PENDING_SETUP' BEFORE 'ACTIVE';

CREATE TYPE "OrganizationOnboardingStatus" AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'READY',
    'FAILED'
);

ALTER TABLE "organizations"
ADD COLUMN "onboardingStatus" "OrganizationOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "onboardingStartedAt" TIMESTAMP(3),
ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN "onboardingLastAttemptAt" TIMESTAMP(3),
ADD COLUMN "onboardingFailureCode" TEXT,
ADD COLUMN "onboardingFailureMessage" TEXT;

ALTER TABLE "organization_memberships"
ADD COLUMN "isTenantOwner" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "organization_memberships_organizationId_isTenantOwner_status_idx"
ON "organization_memberships"("organizationId", "isTenantOwner", "status");
