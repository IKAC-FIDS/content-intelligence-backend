import { PaymentStatus, Prisma, SalesChannel, UserRole } from "@prisma/client";
import { CommercialReportsService } from "../src/reports/commercial-reports.service";
import { ReportingScopeService } from "../src/reports/reporting-scope.service";
import { tenantUser } from "./helpers/tenant-user";

const user = tenantUser({
  userId: "u1",
  email: "u@example.com",
  role: UserRole.ADMIN,
  organizationId: "org1",
});

describe("CommercialReportsService", () => {
  it("keeps financial totals IRR-only, counts each payment once, and enforces organization scope", async () => {
    const payment = (overrides: any) => ({
      id: "p",
      amount: new Prisma.Decimal(100),
      currency: "IRR",
      status: PaymentStatus.PENDING,
      dueDate: new Date("2026-07-01"),
      paidAt: null,
      createdAt: new Date("2026-07-01"),
      opportunity: {
        companyId: "c1",
        ownerId: "u1",
        company: { legalName: "Company", brandName: null },
        owner: { fullName: "Owner" },
      },
      ...overrides,
    });
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ timezone: "Asia/Tehran" }),
      },
      opportunityPayment: {
        findMany: jest.fn().mockResolvedValue([
          payment({ id: "irr" }),
          payment({
            id: "usd",
            currency: "USD",
            amount: new Prisma.Decimal(999),
          }),
        ]),
      },
      opportunityCommercialDocument: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const result = await new CommercialReportsService(
      prisma as any,
      new ReportingScopeService(),
    ).financial({ page: 1, limit: 20 }, user as any);
    expect(result.current.outstandingAmountIrr).toBe("100");
    expect(result.current.outstandingPaymentCount).toBe(1);
    expect(result.excludedCurrencies).toEqual([
      { currency: "USD", paymentCount: 1, documentCount: 0 },
    ]);
    expect(
      prisma.opportunityPayment.findMany.mock.calls[0][0].where.opportunity
        .AND[0],
    ).toMatchObject({ organizationId: "org1" });
  });

  it("separates won sales from active pipeline and preserves snapshot channel/labels", async () => {
    const line = (
      opportunityId: string,
      channel: SalesChannel,
      total: string,
    ) => ({
      id: `${opportunityId}-${channel}`,
      opportunityId,
      productId: null,
      productCodeSnapshot: "CUSTOM",
      productNameSnapshot: "Historical custom",
      salesChannel: channel,
      quantity: new Prisma.Decimal(2),
      unitPrice: new Prisma.Decimal(50),
      discountAmount: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(0),
      lineTotal: new Prisma.Decimal(total),
      product: null,
      opportunity: { wonAt: new Date("2026-07-10") },
    });
    const prisma = {
      opportunityLineItem: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            line("won-1", SalesChannel.LEGACY_UNKNOWN, "100"),
          ])
          .mockResolvedValueOnce([line("active-1", SalesChannel.OTHER, "80")]),
      },
    };
    const result = await new CommercialReportsService(
      prisma as any,
      new ReportingScopeService(),
    ).products(
      { startDate: "2026-07-01", endDate: "2026-07-31", page: 1, limit: 20 },
      user as any,
    );
    expect(result.wonSales.netLineValueIrr).toBe("100");
    expect(result.activePipeline.netLineValueIrr).toBe("80");
    expect(
      result.byChannel.find(
        (x) => x.salesChannel === SalesChannel.LEGACY_UNKNOWN,
      )?.netValueIrr,
    ).toBe("100");
    expect(result.byProduct[0]).toMatchObject({
      productCode: "CUSTOM",
      productName: "Historical custom",
    });
    const activeWhere =
      prisma.opportunityLineItem.findMany.mock.calls[1][0].where;
    expect(JSON.stringify(activeWhere)).toContain('"isTerminal":false');
    expect(JSON.stringify(activeWhere)).not.toContain("terminalType");
  });
});
