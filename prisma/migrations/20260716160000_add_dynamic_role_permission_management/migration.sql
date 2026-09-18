ALTER TABLE "permissions"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "group" TEXT,
  ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "roles" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "baseRole" "UserRole" NOT NULL DEFAULT 'REP',
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
CREATE INDEX "roles_isActive_idx" ON "roles"("isActive");

INSERT INTO "roles" ("id", "code", "name", "baseRole", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, value::text, value::text, value, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM unnest(enum_range(NULL::"UserRole")) AS seeded_role(value);

ALTER TABLE "users" ADD COLUMN "roleId" TEXT;
UPDATE "users" u SET "roleId" = r."id" FROM "roles" r WHERE r."code" = u."role"::text;
CREATE INDEX "users_roleId_idx" ON "users"("roleId");
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD COLUMN "roleId" TEXT;
UPDATE "role_permissions" rp SET "roleId" = r."id" FROM "roles" r WHERE r."code" = rp."role"::text;
ALTER TABLE "role_permissions" ALTER COLUMN "role" DROP NOT NULL;
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");
CREATE INDEX "role_permissions_roleId_idx" ON "role_permissions"("roleId");
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "permissions" SET "isSystem" = true;
