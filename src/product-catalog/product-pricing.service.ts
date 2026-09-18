import { BadRequestException, Injectable } from '@nestjs/common';
import { PricingCurrency, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface PricingInput {
  pricingCurrency: PricingCurrency;
  inPersonInputPrice: string | Prisma.Decimal;
  digikalaInputPrice: string | Prisma.Decimal;
  inPersonProfitPercent?: string | Prisma.Decimal | null;
  digikalaProfitPercent?: string | Prisma.Decimal | null;
}

@Injectable()
export class ProductPricingService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(input: PricingInput, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const inPersonInputPrice = this.nonNegative(input.inPersonInputPrice, 'inPersonInputPrice');
    const digikalaInputPrice = this.nonNegative(input.digikalaInputPrice, 'digikalaInputPrice');
    const calculatedAt = new Date();
    if (input.pricingCurrency === PricingCurrency.IRR) {
      if (input.inPersonProfitPercent != null || input.digikalaProfitPercent != null) throw new BadRequestException('Profit percentages must be null for IRR pricing');
      return { pricingCurrency: PricingCurrency.IRR, inPersonInputPrice, digikalaInputPrice, inPersonProfitPercent: null, digikalaProfitPercent: null, inPersonPriceIrr: inPersonInputPrice.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP), digikalaPriceIrr: digikalaInputPrice.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP), calculatedExchangeRateId: null, priceCalculatedAt: calculatedAt };
    }
    const inPersonProfitPercent = this.profit(input.inPersonProfitPercent, 'inPersonProfitPercent');
    const digikalaProfitPercent = this.profit(input.digikalaProfitPercent, 'digikalaProfitPercent');
    const rate = await client.currencyExchangeRate.findFirst({ where: { baseCurrency: 'USD', quoteCurrency: 'IRR', validFrom: { lte: calculatedAt }, validTo: null }, orderBy: { validFrom: 'desc' } });
    if (!rate) throw new BadRequestException('An active USD to IRR exchange rate is required');
    return this.calculateUsd(input, rate.id, rate.rate, calculatedAt, inPersonProfitPercent, digikalaProfitPercent);
  }

  calculateUsd(input: PricingInput, rateId: string, rateValue: Prisma.Decimal | string, calculatedAt = new Date(), inPersonProfit = this.profit(input.inPersonProfitPercent, 'inPersonProfitPercent'), digikalaProfit = this.profit(input.digikalaProfitPercent, 'digikalaProfitPercent')) {
    const rate = new Prisma.Decimal(rateValue); if (rate.lessThanOrEqualTo(0)) throw new BadRequestException('Exchange rate must be greater than zero');
    const inPersonInputPrice = this.nonNegative(input.inPersonInputPrice, 'inPersonInputPrice'), digikalaInputPrice = this.nonNegative(input.digikalaInputPrice, 'digikalaInputPrice');
    const final = (price: Prisma.Decimal, profit: Prisma.Decimal) => price.mul(rate).mul(new Prisma.Decimal(1).plus(profit.div(100))).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    return { pricingCurrency: PricingCurrency.USD, inPersonInputPrice, digikalaInputPrice, inPersonProfitPercent: inPersonProfit, digikalaProfitPercent: digikalaProfit, inPersonPriceIrr: final(inPersonInputPrice, inPersonProfit), digikalaPriceIrr: final(digikalaInputPrice, digikalaProfit), calculatedExchangeRateId: rateId, priceCalculatedAt: calculatedAt };
  }

  private nonNegative(value: string | Prisma.Decimal, field: string) { let d: Prisma.Decimal; try { d = new Prisma.Decimal(value); } catch { throw new BadRequestException(`${field} must be a decimal string`); } if (d.lessThan(0)) throw new BadRequestException(`${field} cannot be negative`); return d; }
  private profit(value: string | Prisma.Decimal | null | undefined, field: string) { if (value == null) throw new BadRequestException(`${field} is required for USD pricing`); const d = this.nonNegative(value, field); if (d.greaterThan(1000)) throw new BadRequestException(`${field} cannot exceed 1000`); return d; }
}
