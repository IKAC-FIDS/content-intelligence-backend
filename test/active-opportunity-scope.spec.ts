import { activeOpportunityStateWhere } from "../src/common/opportunities/active-opportunity-scope";
import { ReportingScopeService } from "../src/reports/reporting-scope.service";
import { tenantUser } from "./helpers/tenant-user";

describe("canonical active opportunity scope", () => {
  it("uses isTerminal only and excludes archived opportunity/company state", () => {
    expect(activeOpportunityStateWhere()).toEqual({
      archivedAt: null,
      company: { archivedAt: null },
      stage: { isTerminal: false },
    });
    expect(activeOpportunityStateWhere()).not.toHaveProperty(
      "stage.terminalType",
    );
  });

  it("combines canonical state with tenant and reporting filters", () => {
    const user = tenantUser({ userId: "u1", email: "u@example.com", role: "ADMIN", organizationId: "org1" } as any);
    const where = new ReportingScopeService().opportunity(
      {
        ownerIds: ["owner1"],
        teams: ["team1"],
        companyIds: ["company1"],
      } as any,
      user,
      true,
    );
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationId: "org1" }),
        activeOpportunityStateWhere(),
        { ownerId: { in: ["owner1"] } },
        { companyId: { in: ["company1"] } },
      ]),
    );
    expect(JSON.stringify(where)).not.toContain("terminalType");
  });
});
