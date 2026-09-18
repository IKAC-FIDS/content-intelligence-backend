import {
  canViewFinancials,
  redactFinancialResponse,
} from "../src/common/financial/financial-visibility";
import type { CurrentUserPayload } from "../src/common/decorators/current-user.decorator";
import { ReportsController } from "../src/reports/reports.controller";
import { PERMISSIONS_KEY } from "../src/common/decorators/permissions.decorator";

function user(permissions: string[], role: CurrentUserPayload["role"] = "REP") {
  return {
    userId: "user-1",
    email: "user@example.com",
    role,
    tenantContext: { permissions },
  } as CurrentUserPayload;
}

describe("financial visibility", () => {
  const mixedResponse = {
    id: "opportunity-1",
    status: "OPEN",
    probability: 60,
    estimatedValue: "1250000",
    summary: { count: 4, pipelineValue: "5000000" },
    payments: [{ id: "payment-1", amount: "250000", dueDate: new Date(0) }],
    items: [{ quantity: 2, unitPrice: "100", lineTotal: "200" }],
    metrics: [
      { valueType: "COUNT", currentValue: 8, comparisonValue: 6 },
      { valueType: "IRR", currentValue: "500", comparisonValue: "400", absoluteChange: "100" },
    ],
  };

  it("preserves monetary values for an effective financial:view permission", () => {
    expect(redactFinancialResponse(mixedResponse, user(["financial:view"])))
      .toBe(mixedResponse);
  });

  it("keeps mixed metadata and nulls every monetary value", () => {
    const result = redactFinancialResponse(mixedResponse, user([]));

    expect(result).toMatchObject({
      id: "opportunity-1",
      status: "OPEN",
      probability: 60,
      estimatedValue: null,
      summary: { count: 4, pipelineValue: null },
      payments: [{ id: "payment-1", amount: null }],
      items: [{ quantity: 2, unitPrice: null, lineTotal: null }],
      metrics: [
        { valueType: "COUNT", currentValue: 8, comparisonValue: 6 },
        { valueType: "IRR", currentValue: null, comparisonValue: null, absoluteChange: null },
      ],
    });
    expect(result.payments[0].dueDate).toBe(mixedResponse.payments[0].dueDate);
  });

  it("does not grant visibility from a legacy role without the permission", () => {
    expect(canViewFinancials(user([], "ADMIN"))).toBe(false);
  });

  it("marks pure financial report endpoints with financial:view", () => {
    const metadata = Reflect.getMetadata(
      PERMISSIONS_KEY,
      ReportsController.prototype.getFinancialCollections,
    );
    expect(metadata).toEqual({
      actions: ["report:view", "financial:view"],
      mode: "all",
    });
  });

  it("rejects a monetary export before generating a file", async () => {
    const exportReport = jest.fn();
    const controller = new ReportsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { export: exportReport } as never,
    );

    await expect(
      controller.exportReport(
        "financial-collections",
        {},
        user([]),
        {} as never,
      ),
    ).rejects.toThrow("financial:view");
    expect(exportReport).not.toHaveBeenCalled();
  });
});
