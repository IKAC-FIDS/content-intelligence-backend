-- CreateEnum
CREATE TYPE "SsoProviderType" AS ENUM ('OIDC', 'SAML');

-- CreateTable
CREATE TABLE "sso_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SsoProviderType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
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

-- CreateIndex
CREATE INDEX "sso_providers_type_idx" ON "sso_providers"("type");

-- CreateIndex
CREATE INDEX "sso_providers_isActive_idx" ON "sso_providers"("isActive");

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

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "sso_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_login_tickets" ADD CONSTRAINT "sso_login_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_login_tickets" ADD CONSTRAINT "sso_login_tickets_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "sso_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

