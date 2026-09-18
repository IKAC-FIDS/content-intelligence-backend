import 'reflect-metadata';
import { PricingCurrency, Prisma, ProductType, UserRole } from "@prisma/client";
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductCatalogItemDto } from '../src/product-catalog/dto/create-product-catalog-item.dto';
import { FindProductCatalogItemsDto } from '../src/product-catalog/dto/find-product-catalog-items.dto';
import { ProductCatalogService } from "../src/product-catalog/product-catalog.service";
import { ProductPricingService } from "../src/product-catalog/product-pricing.service";
const actor = {
  userId: "user-1",
  email: "a@example.com",
  role: UserRole.ADMIN,
};
function setup(rate: any = null) {
  const prisma: any = {
    $queryRaw: jest.fn(),
    currencyExchangeRate: { findFirst: jest.fn().mockResolvedValue(rate) },
    productCatalogItem: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const history = { append: jest.fn() };
  const pricing = new ProductPricingService(prisma as any);
  const service = new ProductCatalogService(
    prisma as any,
    { record: jest.fn() } as any,
    pricing,
    history as any,
  );
  return { prisma, service, history };
}
describe("ProductCatalogService pricing compatibility", () => {
  it('creates software without hardware-specific fields', async () => {
    const { service, prisma, history } = setup();
    prisma.productCatalogItem.create.mockImplementation(({ data }: any) => ({ id: 'software', ...data }));
    const result = await service.create({ code: 'app', name: 'Software', type: ProductType.SOFTWARE, inPersonInputPrice: '500' }, actor as any);
    expect(result.type).toBe(ProductType.SOFTWARE);
    expect(result.defaultUnitPrice.toString()).toBe('500');
    expect(history.append).toHaveBeenCalled();
  });

  it('filters both data and total server-side without changing pagination', async () => {
    const { service, prisma } = setup();
    await service.findAll({ type: ProductType.SOFTWARE, page: 2, limit: 10, active: 'true' });
    expect(prisma.productCatalogItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: ProductType.SOFTWARE, isActive: true }, skip: 10, take: 10,
    }));
    expect(prisma.productCatalogItem.count).toHaveBeenCalledWith({ where: { type: ProductType.SOFTWARE, isActive: true } });
  });

  it('changes type without recalculating prices or adding price history', async () => {
    const { service, prisma, history } = setup();
    const current = { id: 'p1', type: ProductType.HARDWARE, inPersonPriceIrr: new Prisma.Decimal(100) };
    prisma.productCatalogItem.findUnique.mockResolvedValue(current);
    prisma.productCatalogItem.update.mockImplementation(({ data }: any) => ({ ...current, ...data }));
    const result = await service.update('p1', { type: ProductType.SOFTWARE }, actor as any);
    expect(result.type).toBe(ProductType.SOFTWARE);
    expect(result.inPersonPriceIrr.toString()).toBe('100');
    expect(history.append).not.toHaveBeenCalled();
  });

  it('validates product types and accepts legacy create payloads', async () => {
    const legacy = plainToInstance(CreateProductCatalogItemDto, { code: 'p', name: 'Product' });
    expect(await validate(legacy)).toHaveLength(0);
    const invalid = plainToInstance(CreateProductCatalogItemDto, { code: 'p', name: 'Product', type: 'INVALID' });
    expect((await validate(invalid)).some(error => error.property === 'type')).toBe(true);
    const filter = plainToInstance(FindProductCatalogItemsDto, { type: 'INVALID' });
    expect((await validate(filter)).some(error => error.property === 'type')).toBe(true);
  });

  it("creates an IRR product and synchronizes defaultUnitPrice", async () => {
    const { prisma, service } = setup();
    prisma.productCatalogItem.create.mockImplementation(({ data }: any) => ({
      id: "p1",
      ...data,
    }));
    const result = await service.create(
      {
        code: "p",
        name: "Product",
        pricingCurrency: PricingCurrency.IRR,
        inPersonInputPrice: "100",
        digikalaInputPrice: "120",
      },
      actor as any,
    );
    expect(result.defaultUnitPrice.toString()).toBe("100");
    expect(result.currency).toBe("IRR");
    expect(result.type).toBe(ProductType.HARDWARE);
    expect(result.digikalaPriceIrr.toString()).toBe("120");
  });
  it("creates a USD product using the active rate", async () => {
    const { prisma, service } = setup({
      id: "r1",
      rate: new Prisma.Decimal("1900000"),
    });
    prisma.productCatalogItem.create.mockImplementation(({ data }: any) => ({
      id: "p1",
      ...data,
    }));
    const result = await service.create(
      {
        code: "p",
        name: "Product",
        pricingCurrency: PricingCurrency.USD,
        inPersonInputPrice: "100",
        digikalaInputPrice: "100",
        inPersonProfitPercent: "5",
        digikalaProfitPercent: "30",
      },
      actor as any,
    );
    expect(result.defaultUnitPrice.toString()).toBe("199500000");
    expect(result.digikalaPriceIrr.toString()).toBe("247000000");
    expect(result.currency).toBe("IRR");
  });
  it("updates USD channel inputs and keeps the compatibility snapshot synchronized", async () => {
    const { prisma, service } = setup({
      id: "r2",
      rate: new Prisma.Decimal("2000000"),
    });
    const current = {
      id: "p1",
      code: "P",
      name: "Product",
      pricingCurrency: PricingCurrency.USD,
      inPersonInputPrice: new Prisma.Decimal("100"),
      digikalaInputPrice: new Prisma.Decimal("100"),
      inPersonProfitPercent: new Prisma.Decimal("5"),
      digikalaProfitPercent: new Prisma.Decimal("30"),
    };
    prisma.productCatalogItem.findUnique.mockResolvedValue(current);
    prisma.productCatalogItem.update.mockImplementation(({ data }: any) => ({
      ...current,
      ...data,
    }));
    const result = await service.update(
      "p1",
      { inPersonInputPrice: "110" },
      actor as any,
    );
    expect(result.defaultUnitPrice.toString()).toBe("231000000");
    expect(result.currency).toBe("IRR");
  });
  it("does not append history for a non-pricing edit", async () => {
    const { prisma, service, history } = setup();
    const current = {
      id: "p1",
      code: "P",
      name: "Old",
      pricingCurrency: PricingCurrency.IRR,
      inPersonInputPrice: new Prisma.Decimal(100),
      digikalaInputPrice: new Prisma.Decimal(120),
      inPersonProfitPercent: null,
      digikalaProfitPercent: null,
      inPersonPriceIrr: new Prisma.Decimal(100),
      digikalaPriceIrr: new Prisma.Decimal(120),
      calculatedExchangeRateId: null,
    };
    prisma.productCatalogItem.findUnique.mockResolvedValue(current);
    prisma.productCatalogItem.update.mockImplementation(({ data }: any) => ({
      ...current,
      ...data,
    }));
    await service.update("p1", { name: "New" }, actor as any);
    expect(history.append).not.toHaveBeenCalled();
  });
});
