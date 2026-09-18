CREATE TYPE "OrganizationMembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

CREATE TABLE "organization_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "roleId" TEXT,
    "teamId" TEXT,
    "status" "OrganizationMembershipStatus" NOT NULL DEFAULT 'INVITED',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "lastAccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_memberships_default_active_check"
      CHECK (NOT "isDefault" OR "status" = 'ACTIVE')
);

CREATE UNIQUE INDEX "organization_memberships_userId_organizationId_key"
  ON "organization_memberships"("userId", "organizationId");
CREATE UNIQUE INDEX "organization_memberships_one_active_default_per_user"
  ON "organization_memberships"("userId")
  WHERE "isDefault" = true AND "status" = 'ACTIVE';
CREATE INDEX "organization_memberships_userId_idx" ON "organization_memberships"("userId");
CREATE INDEX "organization_memberships_organizationId_idx" ON "organization_memberships"("organizationId");
CREATE INDEX "organization_memberships_organizationId_status_idx" ON "organization_memberships"("organizationId", "status");
CREATE INDEX "organization_memberships_userId_status_idx" ON "organization_memberships"("userId", "status");
CREATE INDEX "organization_memberships_roleId_idx" ON "organization_memberships"("roleId");
CREATE INDEX "organization_memberships_teamId_idx" ON "organization_memberships"("teamId");
CREATE INDEX "organization_memberships_userId_isDefault_status_idx" ON "organization_memberships"("userId", "isDefault", "status");

ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
