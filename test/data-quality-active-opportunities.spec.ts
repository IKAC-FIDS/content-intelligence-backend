import { Prisma } from "@prisma/client";
import { DataQualityService } from "../src/reports/data-quality.service";
import { ReportingScopeService } from "../src/reports/reporting-scope.service";
import { tenantUser } from "./helpers/tenant-user";

describe("DataQualityService active opportunities", () => {
  it("evaluates NONE terminalType opportunities in organization quality rules", async () => {
    const opportunity = {
      id: "opportunity-1",
      title: "Active",
      ownerId: "owner-1",
      owner: { id: "owner-1", fullName: "Owner" },
      company: { id: "company-1", legalName: "Company", brandName: null },
      estimatedValue: new Prisma.Decimal(100),
      probability: null,
      expectedCloseDate: null,
      primaryContactId: null,
      stageId: "stage-1",
      _count: { lineItems: 0 },
      stageHistories: [],
    };
    const empty = { findMany: jest.fn().mockResolvedValue([]) };
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ role: "ADMIN", roleId: null }),
      },
      rolePermission: { findFirst: jest.fn().mockResolvedValue(null) },
      company: empty,
      opportunity: { findMany: jest.fn().mockResolvedValue([opportunity]) },
      task: empty,
      meeting: empty,
      opportunityPayment: empty,
      opportunityCommercialDocument: empty,
      currencyExchangeRate: { findFirst: jest.fn() },
      productCatalogItem: empty,
    };
    const service = new DataQualityService(
      prisma as any,
      new ReportingScopeService(),
    );
    const result = await service.report(
      {} as any,
      tenantUser({
        userId: "user-1",
        email: "u@example.com",
        role: "ADMIN",
        organizationId: "org-1",
      } as any),
    );

    const probability = result.organization.rules.find(
      (rule) => rule.ruleKey === "OPPORTUNITY_MISSING_PROBABILITY",
    );
    expect(probability).toMatchObject({ eligibleCount: 1, issueCount: 1 });
    expect(
      JSON.stringify(prisma.opportunity.findMany.mock.calls[0][0].where),
    ).toContain('"isTerminal":false');
    expect(
      JSON.stringify(prisma.opportunity.findMany.mock.calls[0][0].where),
    ).not.toContain("terminalType");
    expect(result.globalCatalog).toBeNull();
  });
});
