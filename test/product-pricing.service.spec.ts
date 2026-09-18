import { BadRequestException } from '@nestjs/common';
import { PricingCurrency, Prisma } from '@prisma/client';
import { ProductPricingService } from '../src/product-catalog/product-pricing.service';

describe('ProductPricingService', () => {
  const prisma = { currencyExchangeRate: { findFirst: jest.fn() } };
  const service = new ProductPricingService(prisma as any);

  it('keeps independent IRR channel prices and no profit/rate', async () => {
    const result = await service.calculate({ pricingCurrency: PricingCurrency.IRR, inPersonInputPrice: '100', digikalaInputPrice: '250' });
    expect(result.inPersonPriceIrr.toString()).toBe('100'); expect(result.digikalaPriceIrr.toString()).toBe('250'); expect(result.calculatedExchangeRateId).toBeNull();
  });
  it('calculates independent USD profits with Decimal arithmetic', () => {
    const result = service.calculateUsd({ pricingCurrency: PricingCurrency.USD, inPersonInputPrice: '100', digikalaInputPrice: '100', inPersonProfitPercent: '5', digikalaProfitPercent: '30' }, 'rate-1', new Prisma.Decimal('1900000'));
    expect(result.inPersonPriceIrr.toString()).toBe('199500000'); expect(result.digikalaPriceIrr.toString()).toBe('247000000');
  });
  it('rounds half up to a whole rial', () => {
    const result = service.calculateUsd({ pricingCurrency: PricingCurrency.USD, inPersonInputPrice: '0.5', digikalaInputPrice: '0.499', inPersonProfitPercent: '0', digikalaProfitPercent: '0' }, 'rate-1', '1');
    expect(result.inPersonPriceIrr.toString()).toBe('1'); expect(result.digikalaPriceIrr.toString()).toBe('0');
  });
  it('rejects USD pricing without an active rate', async () => {
    prisma.currencyExchangeRate.findFirst.mockResolvedValue(null);
    await expect(service.calculate({ pricingCurrency: PricingCurrency.USD, inPersonInputPrice: '1', digikalaInputPrice: '1', inPersonProfitPercent: '0', digikalaProfitPercent: '0' })).rejects.toThrow(new BadRequestException('An active USD to IRR exchange rate is required'));
  });
  it('rejects IRR profit percentages', async () => {
    await expect(service.calculate({ pricingCurrency: PricingCurrency.IRR, inPersonInputPrice: '1', digikalaInputPrice: '1', inPersonProfitPercent: '1' })).rejects.toThrow('Profit percentages must be null');
  });
});
