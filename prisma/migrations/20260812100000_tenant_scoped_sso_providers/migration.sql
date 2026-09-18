-- fix 000090 phase A/C: additive tenant ownership and SSO security support.
-- Existing providers remain nullable until the explicit operator backfill.

CREATE TYPE "SsoRoutingKind" AS ENUM ('DOMAIN', 'SUBDOMAIN');

ALTER TABLE "sso_providers"
ADD COLUMN "organizationId" TEXT,
ADD COLUMN "normalizedName" TEXT;

CREATE TABLE "sso_provider_routes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "kind" "SsoRoutingKind" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sso_provider_routes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sso_group_role_mappings" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "normalizedGroup" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sso_group_role_mappings_pkey" PRIMARY KEY ("id")
);

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

CREATE INDEX "sso_providers_organizationId_isActive_idx" ON "sso_providers"("organizationId", "isActive");
CREATE UNIQUE INDEX "sso_providers_organizationId_type_normalizedName_key" ON "sso_providers"("organizationId", "type", "normalizedName");
CREATE UNIQUE INDEX "sso_providers_organizationId_issuer_key" ON "sso_providers"("organizationId", "issuer");
CREATE UNIQUE INDEX "sso_providers_organizationId_clientId_key" ON "sso_providers"("organizationId", "clientId");
CREATE UNIQUE INDEX "sso_providers_organizationId_entityId_key" ON "sso_providers"("organizationId", "entityId");
CREATE UNIQUE INDEX "sso_provider_routes_kind_value_key" ON "sso_provider_routes"("kind", "value");
CREATE UNIQUE INDEX "sso_provider_routes_providerId_kind_value_key" ON "sso_provider_routes"("providerId", "kind", "value");
CREATE INDEX "sso_provider_routes_organizationId_idx" ON "sso_provider_routes"("organizationId");
CREATE INDEX "sso_provider_routes_providerId_idx" ON "sso_provider_routes"("providerId");
CREATE UNIQUE INDEX "sso_group_role_mappings_providerId_normalizedGroup_key" ON "sso_group_role_mappings"("providerId", "normalizedGroup");
CREATE INDEX "sso_group_role_mappings_roleId_idx" ON "sso_group_role_mappings"("roleId");
CREATE UNIQUE INDEX "sso_auth_transactions_stateHash_key" ON "sso_auth_transactions"("stateHash");
CREATE INDEX "sso_auth_transactions_providerId_expiresAt_idx" ON "sso_auth_transactions"("providerId", "expiresAt");
CREATE INDEX "sso_auth_transactions_organizationId_expiresAt_idx" ON "sso_auth_transactions"("organizationId", "expiresAt");
CREATE INDEX "sso_auth_transactions_consumedAt_idx" ON "sso_auth_transactions"("consumedAt");

ALTER TABLE "sso_providers" ADD CONSTRAINT "sso_providers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sso_provider_routes" ADD CONSTRAINT "sso_provider_routes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sso_provider_routes" ADD CONSTRAINT "sso_provider_routes_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "sso_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sso_group_role_mappings" ADD CONSTRAINT "sso_group_role_mappings_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "sso_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sso_group_role_mappings" ADD CONSTRAINT "sso_group_role_mappings_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sso_auth_transactions" ADD CONSTRAINT "sso_auth_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sso_auth_transactions" ADD CONSTRAINT "sso_auth_transactions_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "sso_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
