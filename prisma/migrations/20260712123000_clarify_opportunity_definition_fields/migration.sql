-- Clarify opportunity definition fields without removing legacy source data.

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "sourceOptionId" TEXT,
  ADD COLUMN IF NOT EXISTS "primaryContactId" TEXT,
  ADD COLUMN IF NOT EXISTS "probability" INTEGER,
  ADD COLUMN IF NOT EXISTS "competitor" TEXT;

WITH lookup_seed("group", "code", "label", "sortOrder") AS (
  VALUES
    ('opportunity-sources', 'CUSTOMER_REQUEST', 'درخواست مشتری', 10),
    ('opportunity-sources', 'DEMO_MEETING', 'جلسه دمو', 20),
    ('opportunity-sources', 'DISCOVERY_MEETING', 'جلسه نیازسنجی', 30),
    ('opportunity-sources', 'UPSELL', 'توسعه فروش به مشتری', 40),
    ('opportunity-sources', 'CROSS_SELL', 'فروش محصول مکمل', 50),
    ('opportunity-sources', 'RENEWAL', 'تمدید قرارداد', 60),
    ('opportunity-sources', 'RFP_TENDER', 'مناقصه / RFP', 70),
    ('opportunity-sources', 'PARTNER_REFERRAL', 'معرفی شریک تجاری', 80),
    ('opportunity-sources', 'INTERNAL_REFERRAL', 'معرفی داخلی', 90),
    ('opportunity-sources', 'CAMPAIGN_FOLLOWUP', 'پیگیری کمپین', 100),
    ('opportunity-sources', 'OTHER', 'سایر', 110)
)
INSERT INTO "lookup_options" ("id", "group", "code", "label", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'lookup_' || md5("group" || ':' || "code"), "group", "code", "label", "sortOrder", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM lookup_seed
ON CONFLICT ("group", "code") DO UPDATE SET
  "label" = EXCLUDED."label",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "opportunities" o
SET "sourceOptionId" = lo."id"
FROM "lookup_options" lo
WHERE o."sourceOptionId" IS NULL
  AND o."source" IS NOT NULL
  AND lo."group" = 'opportunity-sources'
  AND (
    lower(lo."code") = lower(btrim(o."source"))
    OR lower(lo."label") = lower(btrim(o."source"))
  );

CREATE INDEX IF NOT EXISTS "opportunities_sourceOptionId_idx" ON "opportunities"("sourceOptionId");
CREATE INDEX IF NOT EXISTS "opportunities_primaryContactId_idx" ON "opportunities"("primaryContactId");
CREATE INDEX IF NOT EXISTS "opportunities_expectedCloseDate_idx" ON "opportunities"("expectedCloseDate");
CREATE INDEX IF NOT EXISTS "opportunities_organizationId_sourceOptionId_idx" ON "opportunities"("organizationId", "sourceOptionId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opportunities_probability_range_check') THEN
    ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_probability_range_check" CHECK ("probability" IS NULL OR ("probability" >= 0 AND "probability" <= 100));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opportunities_sourceOptionId_fkey') THEN
    ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_sourceOptionId_fkey" FOREIGN KEY ("sourceOptionId") REFERENCES "lookup_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opportunities_primaryContactId_fkey') THEN
    ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
