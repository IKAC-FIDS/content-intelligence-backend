CREATE TYPE "SalesChannel" AS ENUM ('LEGACY_UNKNOWN', 'IN_PERSON', 'DIGIKALA', 'OTHER');
CREATE TYPE "ProductPriceHistoryReason" AS ENUM ('MIGRATION_BASELINE', 'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'EXCHANGE_RATE_CHANGED', 'MANUAL_RECALCULATION');

CREATE TABLE "product_price_histories" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "pricingCurrency" "PricingCurrency" NOT NULL,
  "inPersonInputPrice" DECIMAL(24,6) NOT NULL,
  "digikalaInputPrice" DECIMAL(24,6) NOT NULL,
  "inPersonProfitPercent" DECIMAL(7,3),
  "digikalaProfitPercent" DECIMAL(7,3),
  "inPersonPriceIrr" DECIMAL(24,0) NOT NULL,
  "digikalaPriceIrr" DECIMAL(24,0) NOT NULL,
  "calculatedExchangeRateId" TEXT,
  "exchangeRateValueSnapshot" DECIMAL(24,6),
  "reason" "ProductPriceHistoryReason" NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "changedById" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_price_histories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_price_histories_valid_period" CHECK ("validTo" IS NULL OR "validTo" > "validFrom")
);

ALTER TABLE "opportunity_line_items"
  ADD COLUMN "salesChannel" "SalesChannel" NOT NULL DEFAULT 'LEGACY_UNKNOWN',
  ADD COLUMN "catalogUnitPriceIrrSnapshot" DECIMAL(24,0),
  ADD COLUMN "productPriceHistoryId" TEXT;

UPDATE "opportunity_line_items"
SET "catalogUnitPriceIrrSnapshot" = "unitPrice";

WITH baseline AS (SELECT CURRENT_TIMESTAMP AS captured_at)
INSERT INTO "product_price_histories" (
  "id", "productId", "pricingCurrency", "inPersonInputPrice", "digikalaInputPrice",
  "inPersonProfitPercent", "digikalaProfitPercent", "inPersonPriceIrr", "digikalaPriceIrr",
  "calculatedExchangeRateId", "exchangeRateValueSnapshot", "reason", "validFrom", "validTo",
  "changedById", "createdAt"
)
SELECT
  gen_random_uuid()::text, p."id", p."pricingCurrency", p."inPersonInputPrice", p."digikalaInputPrice",
  p."inPersonProfitPercent", p."digikalaProfitPercent", p."inPersonPriceIrr", p."digikalaPriceIrr",
  p."calculatedExchangeRateId", r."rate", 'MIGRATION_BASELINE'::"ProductPriceHistoryReason",
  baseline.captured_at, NULL, NULL, baseline.captured_at
FROM "product_catalog_items" p
CROSS JOIN baseline
LEFT JOIN "currency_exchange_rates" r ON r."id" = p."calculatedExchangeRateId";

ALTER TABLE "opportunity_line_items" ALTER COLUMN "salesChannel" SET DEFAULT 'IN_PERSON';

CREATE INDEX "opportunity_line_items_salesChannel_idx" ON "opportunity_line_items"("salesChannel");
CREATE INDEX "opportunity_line_items_productPriceHistoryId_idx" ON "opportunity_line_items"("productPriceHistoryId");
CREATE INDEX "opportunity_line_items_opportunityId_salesChannel_idx" ON "opportunity_line_items"("opportunityId", "salesChannel");
CREATE INDEX "product_price_histories_productId_validFrom_idx" ON "product_price_histories"("productId", "validFrom");
CREATE INDEX "product_price_histories_reason_validFrom_idx" ON "product_price_histories"("reason", "validFrom");
CREATE INDEX "product_price_histories_calculatedExchangeRateId_idx" ON "product_price_histories"("calculatedExchangeRateId");
CREATE INDEX "product_price_histories_changedById_idx" ON "product_price_histories"("changedById");
CREATE UNIQUE INDEX "product_price_histories_one_open_per_product" ON "product_price_histories"("productId") WHERE "validTo" IS NULL;

ALTER TABLE "product_price_histories" ADD CONSTRAINT "product_price_histories_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_price_histories" ADD CONSTRAINT "product_price_histories_calculatedExchangeRateId_fkey" FOREIGN KEY ("calculatedExchangeRateId") REFERENCES "currency_exchange_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_price_histories" ADD CONSTRAINT "product_price_histories_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "opportunity_line_items" ADD CONSTRAINT "opportunity_line_items_productPriceHistoryId_fkey" FOREIGN KEY ("productPriceHistoryId") REFERENCES "product_price_histories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
