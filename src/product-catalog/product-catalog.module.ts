import { Module } from "@nestjs/common";
import { ProductCatalogController } from "./product-catalog.controller";
import { ProductCatalogService } from "./product-catalog.service";
import { ProductPricingService } from "./product-pricing.service";
import { ProductPriceHistoryService } from "./product-price-history.service";

@Module({
  controllers: [ProductCatalogController],
  providers: [
    ProductCatalogService,
    ProductPricingService,
    ProductPriceHistoryService,
  ],
  exports: [
    ProductCatalogService,
    ProductPricingService,
    ProductPriceHistoryService,
  ],
})
export class ProductCatalogModule {}
