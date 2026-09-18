BEGIN;

CREATE TYPE "ProductType" AS ENUM ('HARDWARE', 'SOFTWARE');
ALTER TABLE "product_catalog_items"
  ADD COLUMN "type" "ProductType" NOT NULL DEFAULT 'HARDWARE';
CREATE INDEX "product_catalog_items_type_isActive_sortOrder_idx"
  ON "product_catalog_items"("type", "isActive", "sortOrder");

COMMIT;
