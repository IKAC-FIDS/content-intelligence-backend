-- Add managed teams while preserving the legacy users.team string.

CREATE TABLE "teams" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "managerId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',

  CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teams_code_key" ON "teams"("code");
CREATE INDEX "teams_managerId_idx" ON "teams"("managerId");
CREATE INDEX "teams_isActive_idx" ON "teams"("isActive");
CREATE INDEX "teams_organizationId_idx" ON "teams"("organizationId");

ALTER TABLE "teams"
  ADD CONSTRAINT "teams_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "teams"
  ADD CONSTRAINT "teams_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "users" ADD COLUMN "teamId" TEXT;
CREATE INDEX "users_teamId_idx" ON "users"("teamId");

WITH legacy_team_values AS (
  SELECT
    COALESCE("organizationId", '00000000-0000-4000-8000-000000000001') AS "organizationId",
    btrim("team") AS "legacyName"
  FROM "users"
  WHERE "team" IS NOT NULL AND btrim("team") <> ''
),
legacy_teams AS (
  SELECT
    "organizationId",
    "legacyName",
    COALESCE(
      NULLIF(
        upper(
          regexp_replace(
            regexp_replace("legacyName", '[^A-Za-z0-9]+', '_', 'g'),
            '^_|_$',
            '',
            'g'
          )
        ),
        ''
      ),
      'TEAM_' || upper(substr(md5("legacyName"), 1, 8))
    ) AS "baseCode"
  FROM legacy_team_values
),
deduped_teams AS (
  SELECT
    "organizationId",
    min("legacyName") AS "name",
    "baseCode",
    row_number() OVER (PARTITION BY "baseCode" ORDER BY "organizationId", min("legacyName")) AS "codeRank"
  FROM legacy_teams
  GROUP BY "organizationId", "baseCode"
),
team_code_map AS (
  SELECT
    "organizationId",
    "name",
    "baseCode",
    CASE
      WHEN "codeRank" = 1 THEN "baseCode"
      ELSE "baseCode" || '_' || "codeRank"::text
    END AS "code"
  FROM deduped_teams
),
inserted_teams AS (
  INSERT INTO "teams" ("id", "code", "name", "organizationId", "createdAt", "updatedAt")
  SELECT
    gen_random_uuid()::text,
    "code",
    "name",
    "organizationId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM team_code_map
  ON CONFLICT ("code") DO NOTHING
  RETURNING "id", "code", "name", "organizationId"
),
all_teams AS (
  SELECT "id", "code", "name", "organizationId" FROM inserted_teams
  UNION
  SELECT "id", "code", "name", "organizationId" FROM "teams"
),
legacy_match AS (
  SELECT
    u."id" AS "userId",
    t."id" AS "teamId"
  FROM "users" u
  JOIN legacy_teams lt
    ON lt."organizationId" = COALESCE(u."organizationId", '00000000-0000-4000-8000-000000000001')
   AND lt."legacyName" = btrim(u."team")
  JOIN team_code_map tcm
    ON tcm."organizationId" = lt."organizationId"
   AND tcm."baseCode" = lt."baseCode"
  JOIN all_teams t
    ON t."organizationId" = lt."organizationId"
   AND t."code" = tcm."code"
  WHERE u."team" IS NOT NULL AND btrim(u."team") <> ''
)
UPDATE "users" u
SET "teamId" = legacy_match."teamId"
FROM legacy_match
WHERE u."id" = legacy_match."userId";

ALTER TABLE "users"
  ADD CONSTRAINT "users_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
