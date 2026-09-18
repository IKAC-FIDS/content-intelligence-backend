CREATE TABLE "product_catalog_items" (
                                         "id" TEXT NOT NULL,
                                         "code" TEXT NOT NULL,
                                         "name" TEXT NOT NULL,
                                         "description" TEXT,
                                         "category" TEXT,
                                         "unit" TEXT,
                                         "defaultUnitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
                                         "currency" TEXT NOT NULL DEFAULT 'IRR',
                                         "isActive" BOOLEAN NOT NULL DEFAULT true,
                                         "sortOrder" INTEGER NOT NULL DEFAULT 0,
                                         "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                         "updatedAt" TIMESTAMP(3) NOT NULL,

                                         CONSTRAINT "product_catalog_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opportunity_line_items" (
                                          "id" TEXT NOT NULL,
                                          "opportunityId" TEXT NOT NULL,
                                          "productId" TEXT,
                                          "productCodeSnapshot" TEXT NOT NULL,
                                          "productNameSnapshot" TEXT NOT NULL,
                                          "description" TEXT,
                                          "quantity" DECIMAL(18,2) NOT NULL,
                                          "unitPrice" DECIMAL(18,2) NOT NULL,
                                          "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
                                          "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
                                          "lineTotal" DECIMAL(18,2) NOT NULL,
                                          "sortOrder" INTEGER NOT NULL DEFAULT 0,
                                          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                          "updatedAt" TIMESTAMP(3) NOT NULL,

                                          CONSTRAINT "opportunity_line_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_catalog_items_code_key" ON "product_catalog_items"("code");
CREATE INDEX "product_catalog_items_isActive_sortOrder_idx" ON "product_catalog_items"("isActive", "sortOrder");
CREATE INDEX "product_catalog_items_category_idx" ON "product_catalog_items"("category");

CREATE INDEX "opportunity_line_items_opportunityId_idx" ON "opportunity_line_items"("opportunityId");
CREATE INDEX "opportunity_line_items_productId_idx" ON "opportunity_line_items"("productId");
CREATE INDEX "opportunity_line_items_sortOrder_idx" ON "opportunity_line_items"("sortOrder");

ALTER TABLE "opportunity_line_items"
    ADD CONSTRAINT "opportunity_line_items_opportunityId_fkey"
        FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "opportunity_line_items"
    ADD CONSTRAINT "opportunity_line_items_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "product_catalog_items"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;