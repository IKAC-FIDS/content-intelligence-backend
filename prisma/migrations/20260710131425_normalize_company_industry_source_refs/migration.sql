-- Add normalized reference columns
ALTER TABLE "companies" ADD COLUMN "industryId" TEXT;
ALTER TABLE "companies" ADD COLUMN "sourceId" TEXT;

-- Backfill company industry reference from legacy industry name
UPDATE "companies" c
SET
    "industryId" = i."id",
    "industry" = i."name"
    FROM "industries" i
WHERE c."industryId" IS NULL
  AND c."industry" IS NOT NULL
  AND trim(c."industry") <> ''
  AND lower(trim(c."industry")) = lower(trim(i."name"));

-- Backfill company source reference from legacy source code or name
UPDATE "companies" c
SET
    "sourceId" = ls."id",
    "source" = ls."code"
    FROM "lead_sources" ls
WHERE c."sourceId" IS NULL
  AND c."source" IS NOT NULL
  AND trim(c."source") <> ''
  AND (
    upper(trim(c."source")) = upper(trim(ls."code"))
   OR lower(trim(c."source")) = lower(trim(ls."name"))
    );

-- Backfill empty source values to SAM_LIST when the default source exists
UPDATE "companies" c
SET
    "sourceId" = ls."id",
    "source" = ls."code"
    FROM "lead_sources" ls
WHERE c."sourceId" IS NULL
  AND (c."source" IS NULL OR trim(c."source") = '')
  AND ls."code" = 'SAM_LIST';

-- Indexes
CREATE INDEX "companies_industryId_idx" ON "companies"("industryId");
CREATE INDEX "companies_sourceId_idx" ON "companies"("sourceId");

-- Foreign keys
ALTER TABLE "companies"
    ADD CONSTRAINT "companies_industryId_fkey"
        FOREIGN KEY ("industryId") REFERENCES "industries"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "companies"
    ADD CONSTRAINT "companies_sourceId_fkey"
        FOREIGN KEY ("sourceId") REFERENCES "lead_sources"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;