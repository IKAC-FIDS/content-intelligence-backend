import { Prisma, SalesChannel, UserRole } from "@prisma/client";
import { OpportunityLineItemsService } from "../src/opportunities/opportunity-line-items.service";

const user = {
  userId: "u1",
  email: "u@example.com",
  role: UserRole.ADMIN,
  organizationId: "org1",
};
const product = {
  id: "p1",
  code: "P1",
  name: "Product",
  isActive: true,
  category: null,
  unit: null,
  currency: "IRR",
  defaultUnitPrice: new Prisma.Decimal(100),
  inPersonPriceIrr: new Prisma.Decimal(100),
  digikalaPriceIrr: new Prisma.Decimal(130),
};
function setup() {
  const prisma = {
    opportunity: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: "o1", archivedAt: null, company: {} }),
      update: jest.fn(),
    },
    productCatalogItem: { findUnique: jest.fn().mockResolvedValue(product) },
    productPriceHistory: {
      findFirst: jest.fn().mockResolvedValue({ id: "h1" }),
    },
    opportunityLineItem: {
      create: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: "l1", ...data })),
      findFirst: jest.fn(),
      update: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: "l1", ...data })),
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: 1 },
        _sum: { lineTotal: new Prisma.Decimal(100) },
      }),
    },
  };
  return {
    prisma,
    service: new OpportunityLineItemsService(
      prisma as any,
      { record: jest.fn() } as any,
    ),
  };
}

describe("OpportunityLineItemsService sales-channel snapshots", () => {
  it("defaults an omitted product channel to IN_PERSON and captures list price/history", async () => {
    const { service } = setup();
    const item = await service.create(
      "o1",
      { productId: "p1", quantity: 2 },
      user as any,
    );
    expect(item.salesChannel).toBe(SalesChannel.IN_PERSON);
    expect(item.unitPrice.toString()).toBe("100");
    expect(item.catalogUnitPriceIrrSnapshot?.toString()).toBe("100");
    expect(item.productPriceHistoryId).toBe("h1");
  });

  it("uses the Digikala catalog price while preserving an explicit negotiated price", async () => {
    const { service } = setup();
    const item = await service.create(
      "o1",
      {
        productId: "p1",
        salesChannel: SalesChannel.DIGIKALA,
        quantity: 1,
        unitPrice: 115,
      },
      user as any,
    );
    expect(item.unitPrice.toString()).toBe("115");
    expect(item.catalogUnitPriceIrrSnapshot?.toString()).toBe("130");
  });

  it("requires a price for OTHER and rejects LEGACY_UNKNOWN writes", async () => {
    const { service } = setup();
    await expect(
      service.create(
        "o1",
        { quantity: 1, salesChannel: SalesChannel.OTHER },
        user as any,
      ),
    ).rejects.toThrow("unitPrice is required");
    await expect(
      service.create(
        "o1",
        {
          productId: "p1",
          quantity: 1,
          salesChannel: SalesChannel.LEGACY_UNKNOWN,
        },
        user as any,
      ),
    ).rejects.toThrow("LEGACY_UNKNOWN");
  });

  it("preserves a legacy snapshot on an unrelated edit", async () => {
    const { prisma, service } = setup();
    prisma.opportunityLineItem.findFirst.mockResolvedValue({
      id: "l1",
      opportunityId: "o1",
      productId: "p1",
      product,
      productCodeSnapshot: "OLD",
      productNameSnapshot: "Old product",
      salesChannel: SalesChannel.LEGACY_UNKNOWN,
      catalogUnitPriceIrrSnapshot: new Prisma.Decimal(90),
      productPriceHistoryId: null,
      quantity: new Prisma.Decimal(1),
      unitPrice: new Prisma.Decimal(95),
      discountAmount: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(0),
      description: null,
      sortOrder: 0,
    });
    const item = await service.update("o1", "l1", { quantity: 2 }, user as any);
    expect(item.salesChannel).toBe(SalesChannel.LEGACY_UNKNOWN);
    expect(item.catalogUnitPriceIrrSnapshot?.toString()).toBe("90");
    expect(item.productPriceHistoryId).toBeNull();
    expect(prisma.productPriceHistory.findFirst).not.toHaveBeenCalled();
  });
});
