import { Module } from '@nestjs/common';
import { ProductCatalogModule } from '../../product-catalog/product-catalog.module';
import { ExchangeRatesController } from './exchange-rates.controller';
import { ExchangeRatesService } from './exchange-rates.service';
@Module({ imports: [ProductCatalogModule], controllers: [ExchangeRatesController], providers: [ExchangeRatesService] })
export class ExchangeRatesModule {}
