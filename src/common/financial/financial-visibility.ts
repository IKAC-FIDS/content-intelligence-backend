import type { CurrentUserPayload } from "../decorators/current-user.decorator";

export const FINANCIAL_VIEW_PERMISSION = "financial:view" as const;

const FINANCIAL_FIELD_NAMES = new Set([
  "amount",
  "estimatedValue",
  "unitPrice",
  "defaultUnitPrice",
  "inPersonPrice",
  "onlinePrice",
  "digikalaPrice",
  "inPersonInputPrice",
  "digikalaInputPrice",
  "inPersonProfitPercent",
  "digikalaProfitPercent",
  "discountAmount",
  "taxAmount",
  "lineTotal",
  "catalogUnitPriceIrrSnapshot",
  "catalogPrice",
  "collectedAmount",
  "receivableAmount",
  "pipelineValue",
  "avgOpportunityValue",
]);

function isFinancialField(key: string) {
  return (
    FINANCIAL_FIELD_NAMES.has(key) ||
    /(?:Amount|Value|Price)Irr$/.test(key)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function canViewFinancials(user?: CurrentUserPayload | null) {
  return Boolean(
    user?.tenantContext?.permissions?.includes(FINANCIAL_VIEW_PERMISSION),
  );
}

/**
 * Redacts monetary values from mixed domain responses while preserving their
 * stable response shape. Non-plain values such as Date and Prisma Decimal are
 * intentionally kept intact when they are not attached to a financial key.
 */
export function redactFinancialResponse<T>(
  value: T,
  user?: CurrentUserPayload | null,
): T {
  if (canViewFinancials(user)) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactFinancialResponse(item, user)) as T;
  }

  if (!isPlainObject(value)) return value;

  const isFinancialMetric = value.valueType === "IRR";
  const financialMetricFields = new Set([
    "currentValue",
    "comparisonValue",
    "absoluteChange",
    "percentChange",
  ]);

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isFinancialField(key) ||
      (isFinancialMetric && financialMetricFields.has(key))
        ? null
        : redactFinancialResponse(item, user),
    ]),
  ) as T;
}
