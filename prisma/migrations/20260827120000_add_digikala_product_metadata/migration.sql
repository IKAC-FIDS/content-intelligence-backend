ALTER TABLE "product_catalog_items"
  ADD COLUMN "digikalaCode" TEXT,
  ADD COLUMN "digikalaUrl" TEXT;

CREATE UNIQUE INDEX "product_catalog_items_digikalaCode_key"
  ON "product_catalog_items"("digikalaCode");
