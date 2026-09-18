-- fix 000089-B: additive tenant settings, branding and verified-domain foundation.
CREATE TYPE "OrganizationCalendarSystem" AS ENUM ('GREGORIAN', 'PERSIAN');
CREATE TYPE "OrganizationDateFormat" AS ENUM ('YYYY_MM_DD', 'DD_MM_YYYY', 'MM_DD_YYYY');
CREATE TYPE "OrganizationDomainType" AS ENUM ('SUBDOMAIN', 'CUSTOM');
CREATE TYPE "OrganizationDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'DISABLED');
CREATE TYPE "OrganizationDomainVerificationMethod" AS ENUM ('DNS_TXT');

CREATE TABLE "organization_settings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Tehran',
  "locale" TEXT NOT NULL DEFAULT 'fa-IR',
  "calendarSystem" "OrganizationCalendarSystem" NOT NULL DEFAULT 'PERSIAN',
  "dateFormat" "OrganizationDateFormat" NOT NULL DEFAULT 'YYYY_MM_DD',
  "firstDayOfWeek" INTEGER NOT NULL DEFAULT 6,
  "emailSenderDisplayName" TEXT,
  "allowPasswordLogin" BOOLEAN NOT NULL DEFAULT true,
  "allowPasskeyLogin" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_settings_firstDayOfWeek_check" CHECK ("firstDayOfWeek" BETWEEN 0 AND 6)
);

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

CREATE UNIQUE INDEX "organization_settings_organizationId_key" ON "organization_settings"("organizationId");
CREATE UNIQUE INDEX "organization_branding_organizationId_key" ON "organization_branding"("organizationId");
CREATE INDEX "organization_branding_logoAttachmentId_idx" ON "organization_branding"("logoAttachmentId");
CREATE INDEX "organization_branding_faviconAttachmentId_idx" ON "organization_branding"("faviconAttachmentId");
CREATE UNIQUE INDEX "organization_domains_hostname_key" ON "organization_domains"("hostname");
CREATE UNIQUE INDEX "organization_domains_subdomainLabel_key" ON "organization_domains"("subdomainLabel");
CREATE INDEX "organization_domains_organizationId_status_idx" ON "organization_domains"("organizationId", "status");
CREATE INDEX "organization_domains_status_hostname_idx" ON "organization_domains"("status", "hostname");

ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_branding" ADD CONSTRAINT "organization_branding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_branding" ADD CONSTRAINT "organization_branding_logoAttachmentId_fkey" FOREIGN KEY ("logoAttachmentId") REFERENCES "file_attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_branding" ADD CONSTRAINT "organization_branding_faviconAttachmentId_fkey" FOREIGN KEY ("faviconAttachmentId") REFERENCES "file_attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_domains" ADD CONSTRAINT "organization_domains_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
