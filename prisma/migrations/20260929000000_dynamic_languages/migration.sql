CREATE TYPE "LanguageDirection" AS ENUM ('LTR', 'RTL');

CREATE TABLE "languages" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nativeName" TEXT NOT NULL,
    "direction" "LanguageDirection" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "languages_code_key" ON "languages"("code");
CREATE UNIQUE INDEX "languages_code_normalized_key" ON "languages"(lower("code"));
CREATE INDEX "languages_isActive_name_idx" ON "languages"("isActive", "name");

INSERT INTO "languages" ("id", "code", "name", "nativeName", "direction", "updatedAt") VALUES
  (gen_random_uuid()::text, 'en', 'English', 'English', 'LTR', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'fa', 'Persian', 'فارسی', 'RTL', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "languages" ("id", "code", "name", "nativeName", "direction", "updatedAt")
SELECT gen_random_uuid()::text, w."defaultLanguageCode", w."defaultLanguageCode", w."defaultLanguageCode",
       CASE WHEN lower(split_part(w."defaultLanguageCode", '-', 1)) IN ('ar', 'fa', 'he', 'ur')
            THEN 'RTL'::"LanguageDirection" ELSE 'LTR'::"LanguageDirection" END,
       CURRENT_TIMESTAMP
FROM "workspaces" w
WHERE w."defaultLanguageCode" IS NOT NULL
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "workspaces" ADD COLUMN "defaultLanguageId" TEXT;

CREATE TABLE "workspace_input_languages" (
    "workspaceId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_input_languages_pkey" PRIMARY KEY ("workspaceId", "languageId")
);

CREATE TABLE "workspace_output_languages" (
    "workspaceId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_output_languages_pkey" PRIMARY KEY ("workspaceId", "languageId")
);

UPDATE "workspaces" w
SET "defaultLanguageId" = l."id"
FROM "languages" l
WHERE l."code" = w."defaultLanguageCode";

INSERT INTO "workspace_output_languages" ("workspaceId", "languageId")
SELECT "id", "defaultLanguageId" FROM "workspaces" WHERE "defaultLanguageId" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE INDEX "workspaces_defaultLanguageId_idx" ON "workspaces"("defaultLanguageId");
CREATE INDEX "workspace_input_languages_languageId_idx" ON "workspace_input_languages"("languageId");
CREATE INDEX "workspace_output_languages_languageId_idx" ON "workspace_output_languages"("languageId");

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_defaultLanguageId_fkey"
  FOREIGN KEY ("defaultLanguageId") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workspace_input_languages" ADD CONSTRAINT "workspace_input_languages_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_input_languages" ADD CONSTRAINT "workspace_input_languages_languageId_fkey"
  FOREIGN KEY ("languageId") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workspace_output_languages" ADD CONSTRAINT "workspace_output_languages_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_output_languages" ADD CONSTRAINT "workspace_output_languages_languageId_fkey"
  FOREIGN KEY ("languageId") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
