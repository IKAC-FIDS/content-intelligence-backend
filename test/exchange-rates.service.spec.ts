import { UserRole } from "@prisma/client";
import { ExchangeRatesService } from "../src/admin/exchange-rates/exchange-rates.service";

const user = {
  userId: "user-1",
  email: "admin@example.com",
  role: UserRole.ADMIN,
};
function setup(active: any = null, products: any[] = []) {
  const created = {
    id: "rate-new",
    rate: "2050000",
    validFrom: new Date("2026-07-20T00:00:00Z"),
    validTo: null,
    createdBy: {},
  };
  const tx = {
    $queryRaw: jest.fn(),
    currencyExchangeRate: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(active)
        .mockResolvedValueOnce(null),
      update: jest.fn(),
      create: jest.fn().mockResolvedValue(created),
    },
    productCatalogItem: {
      findMany: jest.fn().mockResolvedValue(products),
      update: jest.fn().mockImplementation(({ data }: any) => data),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const pricing = {
    calculateUsd: jest
      .fn()
      .mockReturnValue({
        inPersonPriceIrr: "1",
        digikalaPriceIrr: "2",
        calculatedExchangeRateId: "rate-new",
      }),
  };
  const audit = { record: jest.fn() };
  const history = { append: jest.fn() };
  return {
    service: new ExchangeRatesService(
      prisma as any,
      pricing as any,
      audit as any,
      history as any,
    ),
    tx,
    audit,
    history,
  };
}
describe("ExchangeRatesService", () => {
  it("casts the advisory-lock void result to text before Prisma deserializes it", async () => {
    const { service, tx } = setup();
    await service.create(
      { rate: "2050000", effectiveFrom: "2026-07-20T00:00:00Z" },
      user as any,
    );
    const lockQuery = tx.$queryRaw.mock.calls[0][0] as {
      strings: readonly string[];
    };
    const sql = lockQuery.strings.join(" ");
    expect(sql).toContain("pg_advisory_xact_lock(89241377)");
    expect(sql).toMatch(/CAST[\s\S]*AS TEXT/i);
    expect(sql).toContain('AS "lockResult"');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.currencyExchangeRate.findFirst.mock.invocationCallOrder[0],
    );
  });
  it("closes the active range and creates the replacement", async () => {
    const active = { id: "old", validFrom: new Date("2026-01-01T00:00:00Z") };
    const { service, tx } = setup(active);
    await service.create(
      { rate: "2050000", effectiveFrom: "2026-07-20T00:00:00Z" },
      user as any,
    );
    expect(tx.currencyExchangeRate.update).toHaveBeenCalledWith({
      where: { id: "old" },
      data: { validTo: new Date("2026-07-20T00:00:00.000Z") },
    });
    expect(tx.currencyExchangeRate.create).toHaveBeenCalled();
  });
  it("prevents a period starting before the active rate", async () => {
    const { service } = setup({
      id: "old",
      validFrom: new Date("2026-07-19T00:00:00Z"),
    });
    await expect(
      service.create(
        { rate: "1", effectiveFrom: "2026-07-18T00:00:00Z" },
        user as any,
      ),
    ).rejects.toThrow("effectiveFrom must be after");
  });
  it("recalculates USD products transactionally and reports the count", async () => {
    const products = [{ id: "usd-1" }, { id: "usd-2" }];
    const { service, tx, history } = setup(null, products);
    const result = await service.create(
      { rate: "2050000", effectiveFrom: "2026-07-20T00:00:00Z" },
      user as any,
    );
    expect(tx.productCatalogItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pricingCurrency: "USD" } }),
    );
    expect(tx.productCatalogItem.update).toHaveBeenCalledTimes(2);
    expect(history.append).toHaveBeenCalledTimes(2);
    expect(result.recalculatedProductCount).toBe(2);
  });
  it("does not write the audit record when the transaction fails", async () => {
    const { service, tx, audit } = setup(null, [{ id: "usd-1" }]);
    tx.productCatalogItem.update.mockRejectedValue(
      new Error("recalculation failed"),
    );
    await expect(
      service.create(
        { rate: "2050000", effectiveFrom: "2026-07-20T00:00:00Z" },
        user as any,
      ),
    ).rejects.toThrow("recalculation failed");
    expect(audit.record).not.toHaveBeenCalled();
  });
});
