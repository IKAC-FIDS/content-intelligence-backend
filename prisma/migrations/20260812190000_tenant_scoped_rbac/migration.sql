-- fix 000091: additive tenant-scoped RBAC expansion.
CREATE TYPE "RoleScope" AS ENUM ('SYSTEM', 'TENANT');

ALTER TABLE "organizations"
  ADD COLUMN "authorizationVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "roles"
  ADD COLUMN "scope" "RoleScope" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "normalizedCode" TEXT;

CREATE UNIQUE INDEX "roles_organizationId_normalizedCode_key"
  ON "roles"("organizationId", "normalizedCode");
CREATE INDEX "roles_scope_organizationId_isActive_idx"
  ON "roles"("scope", "organizationId", "isActive");

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_scope_ownership_check"
  CHECK (
    ("scope" = 'SYSTEM' AND "organizationId" IS NULL)
    OR
    ("scope" = 'TENANT' AND "organizationId" IS NOT NULL AND "normalizedCode" IS NOT NULL)
  );
