-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'REP', 'BOARDS');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('SYSTEM', 'TENANT');

-- CreateEnum
CREATE TYPE "FeatureKey" AS ENUM ('SSO', 'PASSKEY', 'ADVANCED_RBAC', 'CUSTOM_DOMAINS', 'BRANDING', 'AUDIT', 'REPORTING');

-- CreateEnum
CREATE TYPE "SubscriptionType" AS ENUM ('STANDARD', 'TRIAL', 'MANUAL_CONTRACT');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EntitlementOverrideState" AS ENUM ('ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "QuotaMetric" AS ENUM ('ACTIVE_USERS', 'FILES', 'STORAGE_BYTES', 'API_CALLS', 'WORKFLOW_RUNS', 'WEBHOOK_DELIVERIES', 'EMAIL_SENDS', 'AI_REQUESTS');

-- CreateEnum
CREATE TYPE "QuotaResetPeriod" AS ENUM ('NONE', 'DAILY', 'MONTHLY', 'SUBSCRIPTION_TERM');

-- CreateEnum
CREATE TYPE "UsageReservationStatus" AS ENUM ('RESERVED', 'COMMITTED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SsoProviderType" AS ENUM ('OIDC', 'SAML');

-- CreateEnum
CREATE TYPE "SsoRoutingKind" AS ENUM ('DOMAIN', 'SUBDOMAIN');

-- CreateEnum
CREATE TYPE "AttachmentStorageProvider" AS ENUM ('LOCAL', 'MINIO');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('FILE', 'EXTERNAL_URL');

-- CreateEnum
CREATE TYPE "ArtifactProvider" AS ENUM ('LOCAL', 'OBJECT_STORAGE', 'GOOGLE_DRIVE', 'SHAREPOINT', 'ONEDRIVE', 'GITHUB', 'GENERIC_URL');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('PENDING_SETUP', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrganizationOnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "OrganizationMembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OrganizationCalendarSystem" AS ENUM ('GREGORIAN', 'PERSIAN');

-- CreateEnum
CREATE TYPE "OrganizationDateFormat" AS ENUM ('YYYY_MM_DD', 'DD_MM_YYYY', 'MM_DD_YYYY');

-- CreateEnum
CREATE TYPE "OrganizationDomainType" AS ENUM ('SUBDOMAIN', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OrganizationDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "OrganizationDomainVerificationMethod" AS ENUM ('DNS_TXT');

-- CreateEnum
CREATE TYPE "AuditScope" AS ENUM ('TENANT', 'PLATFORM', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'PLATFORM_ADMIN', 'ANONYMOUS', 'SYSTEM', 'LEGACY');

-- CreateEnum
CREATE TYPE "AuditSource" AS ENUM ('WEB', 'API', 'AUTH', 'BACKGROUND_JOB', 'SCHEDULER', 'PLATFORM', 'SYSTEM', 'LEGACY');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED', 'ERROR', 'LEGACY');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'REP',
    "roleId" TEXT,
    "team" TEXT,
    "teamId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "avatarStorageProvider" "AttachmentStorageProvider",
    "avatarBucket" TEXT,
    "avatarObjectKey" TEXT,
    "avatarStoragePath" TEXT,
    "avatarMimeType" TEXT,
    "avatarOriginalName" TEXT,
    "organizationId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
    "passwordChangedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "managerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "onboardingStatus" "OrganizationOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "onboardingStartedAt" TIMESTAMP(3),
    "onboardingCompletedAt" TIMESTAMP(3),
    "onboardingLastAttemptAt" TIMESTAMP(3),
    "onboardingFailureCode" TEXT,
    "onboardingFailureMessage" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tehran',
    "locale" TEXT NOT NULL DEFAULT 'fa-IR',
    "settings" JSONB,
    "authorizationVersion" INTEGER NOT NULL DEFAULT 1,
    "entitlementVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tehran',
    "locale" TEXT NOT NULL DEFAULT 'fa-IR',
    "calendarSystem" "OrganizationCalendarSystem" NOT NULL DEFAULT 'PERSIAN',
    "dateFormat" "OrganizationDateFormat" NOT NULL DEFAULT 'YYYY_MM_DD',
    "firstDayOfWeek" INTEGER NOT NULL DEFAULT 6,
    "emailSenderDisplayName" TEXT,
    "smtpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpUsername" TEXT,
    "smtpPasswordEnc" TEXT,
    "smtpFromEmail" TEXT,
    "smtpFromName" TEXT,
    "smtpReplyTo" TEXT,
    "allowPasswordLogin" BOOLEAN NOT NULL DEFAULT true,
    "allowPasskeyLogin" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_branding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayTitle" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "logoAttachmentId" TEXT,
    "faviconAttachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_branding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_domains" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "OrganizationDomainType" NOT NULL,
    "hostname" TEXT NOT NULL,
    "subdomainLabel" TEXT,
    "status" "OrganizationDomainStatus" NOT NULL DEFAULT 'PENDING',
    "verificationMethod" "OrganizationDomainVerificationMethod" NOT NULL DEFAULT 'DNS_TXT',
    "verificationTokenHash" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_passkeys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "credentialPublicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "deviceName" TEXT,
    "transports" TEXT[],
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "credentialDeviceType" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SsoProviderType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT,
    "normalizedName" TEXT,
    "autoProvision" BOOLEAN NOT NULL DEFAULT false,
    "defaultRole" "UserRole",
    "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "issuer" TEXT,
    "clientId" TEXT,
    "clientSecretEnc" TEXT,
    "authorizationUrl" TEXT,
    "tokenUrl" TEXT,
    "userInfoUrl" TEXT,
    "jwksUrl" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY['openid', 'profile', 'email']::TEXT[],
    "entityId" TEXT,
    "ssoUrl" TEXT,
    "x509Certificate" TEXT,
    "signRequests" BOOLEAN NOT NULL DEFAULT false,
    "wantAssertionsSigned" BOOLEAN NOT NULL DEFAULT true,
    "wantResponseSigned" BOOLEAN NOT NULL DEFAULT false,
    "emailAttribute" TEXT,
    "nameAttribute" TEXT,
    "groupsAttribute" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_provider_routes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "kind" "SsoRoutingKind" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sso_provider_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_group_role_mappings" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "normalizedGroup" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_group_role_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_auth_transactions" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "nonceEnc" TEXT,
    "pkceVerifierEnc" TEXT,
    "redirectTarget" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sso_auth_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_login_tickets" (
    "id" TEXT NOT NULL,
    "ticketHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sso_login_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "replacedBySessionId" TEXT,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "scope" "AuditScope",
    "actorType" "AuditActorType",
    "actorMembershipId" TEXT,
    "source" "AuditSource",
    "result" "AuditResult",
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestMethod" TEXT,
    "requestPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log_archives" (
    "id" TEXT NOT NULL,
    "originalAuditLogId" TEXT NOT NULL,
    "scope" "AuditScope",
    "organizationId" TEXT,
    "actorId" TEXT,
    "actorType" "AuditActorType",
    "actorMembershipId" TEXT,
    "requestId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestMethod" TEXT,
    "requestPath" TEXT,
    "source" "AuditSource",
    "result" "AuditResult",
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "metadata" JSONB,
    "originalCreatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archiveBatchId" TEXT NOT NULL,
    "contentChecksum" TEXT NOT NULL,

    CONSTRAINT "audit_log_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_retention_policies" (
    "id" TEXT NOT NULL,
    "scope" "AuditScope" NOT NULL,
    "organizationId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "retentionDays" INTEGER,
    "archiveBeforeDelete" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "group" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseRole" "UserRole" NOT NULL DEFAULT 'REP',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scope" "RoleScope" NOT NULL DEFAULT 'SYSTEM',
    "organizationId" TEXT,
    "normalizedCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "roleId" TEXT,
    "teamId" TEXT,
    "status" "OrganizationMembershipStatus" NOT NULL DEFAULT 'INVITED',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isTenantOwner" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "lastAccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_membership_teams" (
    "membershipId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_membership_teams_pkey" PRIMARY KEY ("membershipId","teamId")
);

-- CreateTable
CREATE TABLE "platform_authorities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PlatformRole" NOT NULL DEFAULT 'PLATFORM_ADMIN',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_authorities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role" "UserRole",
    "roleId" TEXT,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_features" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "feature" "FeatureKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "value" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "type" "SubscriptionType" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "gracePeriodEndAt" TIMESTAMP(3),
    "contractReference" TEXT,
    "internalNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_entitlements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "feature" "FeatureKey" NOT NULL,
    "state" "EntitlementOverrideState" NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_quotas" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "metric" "QuotaMetric" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isUnlimited" BOOLEAN NOT NULL DEFAULT false,
    "softLimit" BIGINT,
    "hardLimit" BIGINT,
    "resetPeriod" "QuotaResetPeriod" NOT NULL DEFAULT 'MONTHLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_quota_overrides" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metric" "QuotaMetric" NOT NULL,
    "enabled" BOOLEAN,
    "isUnlimited" BOOLEAN,
    "softLimit" BIGINT,
    "hardLimit" BIGINT,
    "resetPeriod" "QuotaResetPeriod",
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_quota_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metric" "QuotaMetric" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3),
    "currentValue" BIGINT NOT NULL DEFAULT 0,
    "effectiveSoftLimit" BIGINT,
    "effectiveHardLimit" BIGINT,
    "resetPeriod" "QuotaResetPeriod" NOT NULL,
    "configurationState" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metric" "QuotaMetric" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3),
    "finalUsage" BIGINT NOT NULL,
    "softLimit" BIGINT,
    "hardLimit" BIGINT,
    "percentageBasisPts" INTEGER,
    "exceeded" BOOLEAN NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_threshold_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metric" "QuotaMetric" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "threshold" INTEGER NOT NULL,
    "usageValue" BIGINT NOT NULL,
    "limitValue" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_threshold_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_reservations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "counterId" TEXT NOT NULL,
    "metric" "QuotaMetric" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "UsageReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "expiresAt" TIMESTAMP(3),
    "committedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metric" "QuotaMetric" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_attachments" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" "ArtifactType" NOT NULL DEFAULT 'FILE',
    "provider" "ArtifactProvider" NOT NULL DEFAULT 'LOCAL',
    "storageProvider" "AttachmentStorageProvider" NOT NULL DEFAULT 'LOCAL',
    "name" TEXT NOT NULL,
    "externalUrl" TEXT,
    "metadata" JSONB,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "versionLabel" TEXT,
    "confidentiality" TEXT,
    "bucket" TEXT,
    "objectKey" TEXT,
    "storagePath" TEXT,
    "originalFileName" TEXT,
    "storedFileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "description" TEXT,
    "uploadedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',

    CONSTRAINT "file_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "users_teamId_idx" ON "users"("teamId");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE INDEX "teams_managerId_idx" ON "teams"("managerId");

-- CreateIndex
CREATE INDEX "teams_isActive_idx" ON "teams"("isActive");

-- CreateIndex
CREATE INDEX "teams_organizationId_idx" ON "teams"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_organizationId_code_key" ON "teams"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE INDEX "organizations_createdAt_idx" ON "organizations"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "organization_settings_organizationId_key" ON "organization_settings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_branding_organizationId_key" ON "organization_branding"("organizationId");

-- CreateIndex
CREATE INDEX "organization_branding_logoAttachmentId_idx" ON "organization_branding"("logoAttachmentId");

-- CreateIndex
CREATE INDEX "organization_branding_faviconAttachmentId_idx" ON "organization_branding"("faviconAttachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_domains_hostname_key" ON "organization_domains"("hostname");

-- CreateIndex
CREATE UNIQUE INDEX "organization_domains_subdomainLabel_key" ON "organization_domains"("subdomainLabel");

-- CreateIndex
CREATE INDEX "organization_domains_organizationId_status_idx" ON "organization_domains"("organizationId", "status");

-- CreateIndex
CREATE INDEX "organization_domains_status_hostname_idx" ON "organization_domains"("status", "hostname");

-- CreateIndex
CREATE UNIQUE INDEX "user_passkeys_credentialId_key" ON "user_passkeys"("credentialId");

-- CreateIndex
CREATE INDEX "user_passkeys_userId_idx" ON "user_passkeys"("userId");

-- CreateIndex
CREATE INDEX "sso_providers_type_idx" ON "sso_providers"("type");

-- CreateIndex
CREATE INDEX "sso_providers_isActive_idx" ON "sso_providers"("isActive");

-- CreateIndex
CREATE INDEX "sso_providers_organizationId_isActive_idx" ON "sso_providers"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "sso_providers_organizationId_type_normalizedName_key" ON "sso_providers"("organizationId", "type", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "sso_providers_organizationId_issuer_key" ON "sso_providers"("organizationId", "issuer");

-- CreateIndex
CREATE UNIQUE INDEX "sso_providers_organizationId_clientId_key" ON "sso_providers"("organizationId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "sso_providers_organizationId_entityId_key" ON "sso_providers"("organizationId", "entityId");

-- CreateIndex
CREATE INDEX "sso_provider_routes_organizationId_idx" ON "sso_provider_routes"("organizationId");

-- CreateIndex
CREATE INDEX "sso_provider_routes_providerId_idx" ON "sso_provider_routes"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "sso_provider_routes_kind_value_key" ON "sso_provider_routes"("kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "sso_provider_routes_providerId_kind_value_key" ON "sso_provider_routes"("providerId", "kind", "value");

-- CreateIndex
CREATE INDEX "sso_group_role_mappings_roleId_idx" ON "sso_group_role_mappings"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "sso_group_role_mappings_providerId_normalizedGroup_key" ON "sso_group_role_mappings"("providerId", "normalizedGroup");

-- CreateIndex
CREATE UNIQUE INDEX "sso_auth_transactions_stateHash_key" ON "sso_auth_transactions"("stateHash");

-- CreateIndex
CREATE INDEX "sso_auth_transactions_providerId_expiresAt_idx" ON "sso_auth_transactions"("providerId", "expiresAt");

-- CreateIndex
CREATE INDEX "sso_auth_transactions_organizationId_expiresAt_idx" ON "sso_auth_transactions"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "sso_auth_transactions_consumedAt_idx" ON "sso_auth_transactions"("consumedAt");

-- CreateIndex
CREATE INDEX "external_identities_userId_idx" ON "external_identities"("userId");

-- CreateIndex
CREATE INDEX "external_identities_email_idx" ON "external_identities"("email");

-- CreateIndex
CREATE UNIQUE INDEX "external_identities_providerId_subject_key" ON "external_identities"("providerId", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "sso_login_tickets_ticketHash_key" ON "sso_login_tickets"("ticketHash");

-- CreateIndex
CREATE INDEX "sso_login_tickets_userId_idx" ON "sso_login_tickets"("userId");

-- CreateIndex
CREATE INDEX "sso_login_tickets_providerId_idx" ON "sso_login_tickets"("providerId");

-- CreateIndex
CREATE INDEX "sso_login_tickets_expiresAt_idx" ON "sso_login_tickets"("expiresAt");

-- CreateIndex
CREATE INDEX "sso_login_tickets_consumedAt_idx" ON "sso_login_tickets"("consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_refreshTokenHash_key" ON "refresh_sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "refresh_sessions_userId_idx" ON "refresh_sessions"("userId");

-- CreateIndex
CREATE INDEX "refresh_sessions_expiresAt_idx" ON "refresh_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "refresh_sessions_revokedAt_idx" ON "refresh_sessions"("revokedAt");

-- CreateIndex
CREATE INDEX "refresh_sessions_userId_revokedAt_expiresAt_idx" ON "refresh_sessions"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_requestId_idx" ON "audit_logs"("requestId");

-- CreateIndex
CREATE INDEX "audit_logs_ipAddress_idx" ON "audit_logs"("ipAddress");

-- CreateIndex
CREATE INDEX "audit_logs_requestMethod_idx" ON "audit_logs"("requestMethod");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_scope_createdAt_idx" ON "audit_logs"("scope", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_scope_createdAt_idx" ON "audit_logs"("organizationId", "scope", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorMembershipId_createdAt_idx" ON "audit_logs"("actorMembershipId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_source_result_createdAt_idx" ON "audit_logs"("source", "result", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_archives_originalAuditLogId_key" ON "audit_log_archives"("originalAuditLogId");

-- CreateIndex
CREATE INDEX "audit_log_archives_organizationId_scope_originalCreatedAt_idx" ON "audit_log_archives"("organizationId", "scope", "originalCreatedAt");

-- CreateIndex
CREATE INDEX "audit_log_archives_archiveBatchId_idx" ON "audit_log_archives"("archiveBatchId");

-- CreateIndex
CREATE INDEX "audit_retention_policies_scope_organizationId_idx" ON "audit_retention_policies"("scope", "organizationId");

-- CreateIndex
CREATE INDEX "audit_retention_policies_enabled_idx" ON "audit_retention_policies"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_action_key" ON "permissions"("action");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "roles_isActive_idx" ON "roles"("isActive");

-- CreateIndex
CREATE INDEX "roles_scope_organizationId_isActive_idx" ON "roles"("scope", "organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organizationId_normalizedCode_key" ON "roles"("organizationId", "normalizedCode");

-- CreateIndex
CREATE INDEX "organization_memberships_userId_idx" ON "organization_memberships"("userId");

-- CreateIndex
CREATE INDEX "organization_memberships_organizationId_idx" ON "organization_memberships"("organizationId");

-- CreateIndex
CREATE INDEX "organization_memberships_organizationId_status_idx" ON "organization_memberships"("organizationId", "status");

-- CreateIndex
CREATE INDEX "organization_memberships_organizationId_isTenantOwner_statu_idx" ON "organization_memberships"("organizationId", "isTenantOwner", "status");

-- CreateIndex
CREATE INDEX "organization_memberships_userId_status_idx" ON "organization_memberships"("userId", "status");

-- CreateIndex
CREATE INDEX "organization_memberships_roleId_idx" ON "organization_memberships"("roleId");

-- CreateIndex
CREATE INDEX "organization_memberships_teamId_idx" ON "organization_memberships"("teamId");

-- CreateIndex
CREATE INDEX "organization_memberships_userId_isDefault_status_idx" ON "organization_memberships"("userId", "isDefault", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_userId_organizationId_key" ON "organization_memberships"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "organization_membership_teams_teamId_idx" ON "organization_membership_teams"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_authorities_userId_key" ON "platform_authorities"("userId");

-- CreateIndex
CREATE INDEX "platform_authorities_role_idx" ON "platform_authorities"("role");

-- CreateIndex
CREATE INDEX "role_permissions_roleId_idx" ON "role_permissions"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permissionId_key" ON "role_permissions"("role", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "plans_isActive_idx" ON "plans"("isActive");

-- CreateIndex
CREATE INDEX "plan_features_feature_idx" ON "plan_features"("feature");

-- CreateIndex
CREATE UNIQUE INDEX "plan_features_planId_feature_key" ON "plan_features"("planId", "feature");

-- CreateIndex
CREATE INDEX "subscriptions_organizationId_status_startAt_endAt_idx" ON "subscriptions"("organizationId", "status", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "subscriptions_planId_idx" ON "subscriptions"("planId");

-- CreateIndex
CREATE INDEX "organization_entitlements_feature_idx" ON "organization_entitlements"("feature");

-- CreateIndex
CREATE UNIQUE INDEX "organization_entitlements_organizationId_feature_key" ON "organization_entitlements"("organizationId", "feature");

-- CreateIndex
CREATE INDEX "plan_quotas_metric_idx" ON "plan_quotas"("metric");

-- CreateIndex
CREATE UNIQUE INDEX "plan_quotas_planId_metric_key" ON "plan_quotas"("planId", "metric");

-- CreateIndex
CREATE INDEX "organization_quota_overrides_metric_idx" ON "organization_quota_overrides"("metric");

-- CreateIndex
CREATE UNIQUE INDEX "organization_quota_overrides_organizationId_metric_key" ON "organization_quota_overrides"("organizationId", "metric");

-- CreateIndex
CREATE INDEX "usage_counters_organizationId_metric_periodEnd_idx" ON "usage_counters"("organizationId", "metric", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_organizationId_metric_periodStart_key" ON "usage_counters"("organizationId", "metric", "periodStart");

-- CreateIndex
CREATE INDEX "usage_snapshots_organizationId_capturedAt_idx" ON "usage_snapshots"("organizationId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "usage_snapshots_organizationId_metric_periodStart_key" ON "usage_snapshots"("organizationId", "metric", "periodStart");

-- CreateIndex
CREATE INDEX "quota_threshold_events_organizationId_createdAt_idx" ON "quota_threshold_events"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "quota_threshold_events_organizationId_metric_periodStart_th_key" ON "quota_threshold_events"("organizationId", "metric", "periodStart", "threshold");

-- CreateIndex
CREATE INDEX "usage_reservations_organizationId_status_expiresAt_idx" ON "usage_reservations"("organizationId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "usage_reservations_organizationId_metric_idempotencyKey_key" ON "usage_reservations"("organizationId", "metric", "idempotencyKey");

-- CreateIndex
CREATE INDEX "usage_events_organizationId_metric_periodStart_idx" ON "usage_events"("organizationId", "metric", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "usage_events_organizationId_metric_idempotencyKey_key" ON "usage_events"("organizationId", "metric", "idempotencyKey");

-- CreateIndex
CREATE INDEX "file_attachments_entityType_entityId_idx" ON "file_attachments"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "file_attachments_storageProvider_idx" ON "file_attachments"("storageProvider");

-- CreateIndex
CREATE INDEX "file_attachments_bucket_idx" ON "file_attachments"("bucket");

-- CreateIndex
CREATE INDEX "file_attachments_objectKey_idx" ON "file_attachments"("objectKey");

-- CreateIndex
CREATE INDEX "file_attachments_uploadedById_idx" ON "file_attachments"("uploadedById");

-- CreateIndex
CREATE INDEX "file_attachments_sha256_idx" ON "file_attachments"("sha256");

-- CreateIndex
CREATE INDEX "file_attachments_deletedAt_idx" ON "file_attachments"("deletedAt");

-- CreateIndex
CREATE INDEX "file_attachments_organizationId_idx" ON "file_attachments"("organizationId");

-- CreateIndex
CREATE INDEX "file_attachments_organizationId_entityType_entityId_idx" ON "file_attachments"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "file_attachments_organizationId_type_provider_createdAt_idx" ON "file_attachments"("organizationId", "type", "provider", "createdAt");

-- CreateIndex
CREATE INDEX "file_attachments_organizationId_name_idx" ON "file_attachments"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_branding" ADD CONSTRAINT "organization_branding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_branding" ADD CONSTRAINT "organization_branding_logoAttachmentId_fkey" FOREIGN KEY ("logoAttachmentId") REFERENCES "file_attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_branding" ADD CONSTRAINT "organization_branding_faviconAttachmentId_fkey" FOREIGN KEY ("faviconAttachmentId") REFERENCES "file_attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_domains" ADD CONSTRAINT "organization_domains_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_passkeys" ADD CONSTRAINT "user_passkeys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_providers" ADD CONSTRAINT "sso_providers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_provider_routes" ADD CONSTRAINT "sso_provider_routes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_provider_routes" ADD CONSTRAINT "sso_provider_routes_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "sso_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_group_role_mappings" ADD CONSTRAINT "sso_group_role_mappings_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "sso_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_group_role_mappings" ADD CONSTRAINT "sso_group_role_mappings_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_auth_transactions" ADD CONSTRAINT "sso_auth_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_auth_transactions" ADD CONSTRAINT "sso_auth_transactions_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "sso_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "sso_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_login_tickets" ADD CONSTRAINT "sso_login_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_login_tickets" ADD CONSTRAINT "sso_login_tickets_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "sso_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_membership_teams" ADD CONSTRAINT "organization_membership_teams_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_membership_teams" ADD CONSTRAINT "organization_membership_teams_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_authorities" ADD CONSTRAINT "platform_authorities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_entitlements" ADD CONSTRAINT "organization_entitlements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_quotas" ADD CONSTRAINT "plan_quotas_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_quota_overrides" ADD CONSTRAINT "organization_quota_overrides_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_snapshots" ADD CONSTRAINT "usage_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_threshold_events" ADD CONSTRAINT "quota_threshold_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "usage_counters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foundation invariants that Prisma schema syntax cannot represent.
ALTER TABLE "organization_settings"
  ADD CONSTRAINT "organization_settings_firstDayOfWeek_check"
  CHECK ("firstDayOfWeek" BETWEEN 0 AND 6);

ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_default_active_check"
  CHECK (NOT "isDefault" OR "status" = 'ACTIVE');
CREATE UNIQUE INDEX "organization_memberships_one_active_default_per_user"
  ON "organization_memberships"("userId")
  WHERE "isDefault" = true AND "status" = 'ACTIVE';

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_scope_ownership_check"
  CHECK (
    ("scope" = 'SYSTEM' AND "organizationId" IS NULL)
    OR
    ("scope" = 'TENANT' AND "organizationId" IS NOT NULL AND "normalizedCode" IS NOT NULL)
  );

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_dates_check"
  CHECK ("endAt" IS NULL OR "endAt" > "startAt"),
  ADD CONSTRAINT "subscriptions_grace_check"
  CHECK ("gracePeriodEndAt" IS NULL OR ("endAt" IS NOT NULL AND "gracePeriodEndAt" > "endAt"));
CREATE UNIQUE INDEX "subscriptions_one_current_per_organization_key"
  ON "subscriptions"("organizationId")
  WHERE "status" IN ('PENDING', 'ACTIVE', 'SUSPENDED');

ALTER TABLE "plan_quotas"
  ADD CONSTRAINT "plan_quotas_non_negative_check"
  CHECK (("softLimit" IS NULL OR "softLimit" >= 0) AND ("hardLimit" IS NULL OR "hardLimit" >= 0)),
  ADD CONSTRAINT "plan_quotas_limit_order_check"
  CHECK ("softLimit" IS NULL OR "hardLimit" IS NULL OR "softLimit" <= "hardLimit"),
  ADD CONSTRAINT "plan_quotas_unlimited_check"
  CHECK (NOT "isUnlimited" OR ("softLimit" IS NULL AND "hardLimit" IS NULL));

ALTER TABLE "organization_quota_overrides"
  ADD CONSTRAINT "organization_quota_overrides_non_negative_check"
  CHECK (("softLimit" IS NULL OR "softLimit" >= 0) AND ("hardLimit" IS NULL OR "hardLimit" >= 0)),
  ADD CONSTRAINT "organization_quota_overrides_limit_order_check"
  CHECK ("softLimit" IS NULL OR "hardLimit" IS NULL OR "softLimit" <= "hardLimit"),
  ADD CONSTRAINT "organization_quota_overrides_unlimited_check"
  CHECK ("isUnlimited" IS DISTINCT FROM true OR ("softLimit" IS NULL AND "hardLimit" IS NULL));

ALTER TABLE "usage_counters"
  ADD CONSTRAINT "usage_counters_non_negative_check" CHECK ("currentValue" >= 0),
  ADD CONSTRAINT "usage_counters_period_check" CHECK ("periodEnd" IS NULL OR "periodEnd" > "periodStart"),
  ADD CONSTRAINT "usage_counters_limit_order_check"
  CHECK ("effectiveSoftLimit" IS NULL OR "effectiveHardLimit" IS NULL OR "effectiveSoftLimit" <= "effectiveHardLimit");

ALTER TABLE "usage_snapshots"
  ADD CONSTRAINT "usage_snapshots_non_negative_check" CHECK ("finalUsage" >= 0),
  ADD CONSTRAINT "usage_snapshots_period_check" CHECK ("periodEnd" IS NULL OR "periodEnd" > "periodStart");

ALTER TABLE "quota_threshold_events"
  ADD CONSTRAINT "quota_threshold_events_threshold_check" CHECK ("threshold" IN (80, 90));

ALTER TABLE "usage_reservations"
  ADD CONSTRAINT "usage_reservations_amount_check" CHECK ("amount" > 0);

ALTER TABLE "usage_events"
  ADD CONSTRAINT "usage_events_amount_check" CHECK ("amount" > 0);

ALTER TABLE "audit_retention_policies"
  ADD CONSTRAINT "audit_retention_policy_days_check" CHECK ("retentionDays" IS NULL OR "retentionDays" > 0);
