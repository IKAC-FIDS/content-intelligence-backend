CREATE TYPE "PricingCurrency" AS ENUM ('IRR', 'USD');

CREATE TABLE "currency_exchange_rates" (
  "id" TEXT NOT NULL,
  "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
  "quoteCurrency" TEXT NOT NULL DEFAULT 'IRR',
  "rate" DECIMAL(24,6) NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "currency_exchange_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "currency_exchange_rates_positive_rate" CHECK ("rate" > 0),
  CONSTRAINT "currency_exchange_rates_valid_period" CHECK ("validTo" IS NULL OR "validTo" > "validFrom"),
  CONSTRAINT "currency_exchange_rates_currency_pair" CHECK ("baseCurrency" = 'USD' AND "quoteCurrency" = 'IRR')
);
CREATE INDEX "currency_exchange_rates_baseCurrency_quoteCurrency_validFrom_idx" ON "currency_exchange_rates"("baseCurrency", "quoteCurrency", "validFrom");
CREATE INDEX "currency_exchange_rates_baseCurrency_quoteCurrency_validTo_idx" ON "currency_exchange_rates"("baseCurrency", "quoteCurrency", "validTo");
CREATE UNIQUE INDEX "currency_exchange_rates_one_active_pair" ON "currency_exchange_rates"("baseCurrency", "quoteCurrency") WHERE "validTo" IS NULL;
ALTER TABLE "currency_exchange_rates" ADD CONSTRAINT "currency_exchange_rates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_catalog_items"
  ADD COLUMN "pricingCurrency" "PricingCurrency" NOT NULL DEFAULT 'IRR',
  ADD COLUMN "inPersonInputPrice" DECIMAL(24,6),
  ADD COLUMN "digikalaInputPrice" DECIMAL(24,6),
  ADD COLUMN "inPersonProfitPercent" DECIMAL(7,3),
  ADD COLUMN "digikalaProfitPercent" DECIMAL(7,3),
  ADD COLUMN "inPersonPriceIrr" DECIMAL(24,0),
  ADD COLUMN "digikalaPriceIrr" DECIMAL(24,0),
  ADD COLUMN "calculatedExchangeRateId" TEXT,
  ADD COLUMN "priceCalculatedAt" TIMESTAMP(3);

UPDATE "product_catalog_items" SET
  "inPersonInputPrice" = "defaultUnitPrice",
  "digikalaInputPrice" = "defaultUnitPrice",
  "inPersonPriceIrr" = ROUND("defaultUnitPrice", 0),
  "digikalaPriceIrr" = ROUND("defaultUnitPrice", 0),
  "defaultUnitPrice" = ROUND("defaultUnitPrice", 0),
  "currency" = 'IRR',
  "priceCalculatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "product_catalog_items"
  ALTER COLUMN "inPersonInputPrice" SET NOT NULL,
  ALTER COLUMN "inPersonInputPrice" SET DEFAULT 0,
  ALTER COLUMN "digikalaInputPrice" SET NOT NULL,
  ALTER COLUMN "digikalaInputPrice" SET DEFAULT 0,
  ALTER COLUMN "inPersonPriceIrr" SET NOT NULL,
  ALTER COLUMN "inPersonPriceIrr" SET DEFAULT 0,
  ALTER COLUMN "digikalaPriceIrr" SET NOT NULL,
  ALTER COLUMN "digikalaPriceIrr" SET DEFAULT 0,
  ADD CONSTRAINT "product_prices_non_negative" CHECK ("inPersonInputPrice" >= 0 AND "digikalaInputPrice" >= 0 AND "inPersonPriceIrr" >= 0 AND "digikalaPriceIrr" >= 0),
  ADD CONSTRAINT "product_profit_percent_range" CHECK (("inPersonProfitPercent" IS NULL OR ("inPersonProfitPercent" >= 0 AND "inPersonProfitPercent" <= 1000)) AND ("digikalaProfitPercent" IS NULL OR ("digikalaProfitPercent" >= 0 AND "digikalaProfitPercent" <= 1000)));
CREATE INDEX "product_catalog_items_pricingCurrency_idx" ON "product_catalog_items"("pricingCurrency");
CREATE INDEX "product_catalog_items_calculatedExchangeRateId_idx" ON "product_catalog_items"("calculatedExchangeRateId");
ALTER TABLE "product_catalog_items" ADD CONSTRAINT "product_catalog_items_calculatedExchangeRateId_fkey" FOREIGN KEY ("calculatedExchangeRateId") REFERENCES "currency_exchange_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "action", "description", "name", "group", "isSystem", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'exchange-rate:view', 'View USD to IRR exchange-rate history', 'View exchange rates', 'Exchange rates', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'exchange-rate:manage', 'Create USD to IRR exchange rates', 'Manage exchange rates', 'Exchange rates', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("action") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'ADMIN'::"UserRole", r."id", p."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" = 'ADMIN' AND r."isSystem" = true AND p."action" IN ('exchange-rate:view', 'exchange-rate:manage')
ON CONFLICT DO NOTHING;
