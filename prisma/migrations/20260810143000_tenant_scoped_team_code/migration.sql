-- Team is the only roadmap candidate proven to be directly Tenant-owned.
-- Existing rows already have a required, foreign-keyed organizationId, so no
-- data rewrite is needed. Removing the default prevents future unscoped SQL
-- writers from silently assigning the legacy Organization.
ALTER TABLE "teams"
  ALTER COLUMN "organizationId" DROP DEFAULT;

-- This conversion intentionally ends global Team-code uniqueness. The runtime
-- and seed use the composite selector before this migration is deployed.
DROP INDEX "teams_code_key";

CREATE UNIQUE INDEX "teams_organizationId_code_key"
  ON "teams"("organizationId", "code");
