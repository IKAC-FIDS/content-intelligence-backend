import { Injectable } from "@nestjs/common";
import {
  PaymentStatus,
  Prisma,
  ProductPriceHistoryReason,
  SalesChannel,
} from "@prisma/client";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { parseApiDateRange } from "../common/dates/api-date.util";
import { organizationDayBounds } from "../common/dates/timezone-boundary.util";
import { getCurrentOrganizationId } from "../common/tenant/tenant-scope.util";
import { PrismaService } from "../prisma/prisma.service";
import { AdvancedReportFiltersDto } from "./dto/advanced-report-filters.dto";
import { ReportingScopeService } from "./reporting-scope.service";

const OUTSTANDING: PaymentStatus[] = [
  PaymentStatus.PENDING,
  PaymentStatus.PARTIAL,
  PaymentStatus.OVERDUE,
];
@Injectable()
export class CommercialReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ReportingScopeService,
  ) {}
  private decimal(value: Prisma.Decimal | string | number | null | undefined) {
    return new Prisma.Decimal(value ?? 0);
  }
  private sum<T>(
    rows: T[],
    value: (row: T) => Prisma.Decimal | string | number | null | undefined,
  ) {
    return rows.reduce(
      (total, row) => total.plus(value(row) ?? 0),
      new Prisma.Decimal(0),
    );
  }
  private percentage(part: Prisma.Decimal, total: Prisma.Decimal) {
    return total.isZero()
      ? 0
      : part.div(total).mul(100).toDecimalPlaces(2).toNumber();
  }
  private range(f: AdvancedReportFiltersDto) {
    return parseApiDateRange(f.startDate, f.endDate, "startDate", "endDate");
  }
  private scope(
    f: AdvancedReportFiltersDto,
    user: CurrentUserPayload,
    active = false,
  ): Prisma.OpportunityWhereInput {
    return this.scopes.opportunity(f, user, active);
  }
  private period(range: ReturnType<CommercialReportsService["range"]>) {
    return {
      startDate: range?.gte?.toISOString() ?? null,
      endDate: (range?.lt ?? range?.lte)?.toISOString() ?? null,
    };
  }

  async financial(f: AdvancedReportFiltersDto, user: CurrentUserPayload) {
    const now = new Date(),
      organization = await this.prisma.organization.findUnique({
        where: { id: getCurrentOrganizationId(user) },
        select: { timezone: true },
      });
    const today = organizationDayBounds(now, organization?.timezone ?? "UTC"),
      range = this.range(f),
      opportunity = this.scope(f, user);
    const [payments, documents] = await Promise.all([
      this.prisma.opportunityPayment.findMany({
        where: { opportunity },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          dueDate: true,
          paidAt: true,
          createdAt: true,
          opportunity: {
            select: {
              companyId: true,
              ownerId: true,
              company: { select: { legalName: true, brandName: true } },
              owner: { select: { fullName: true } },
            },
          },
        },
      }),
      this.prisma.opportunityCommercialDocument.findMany({
        where: { opportunity },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
          issuedAt: true,
          acceptedAt: true,
          signedAt: true,
        },
      }),
    ]);
    const irrPayments = payments.filter(
        (p) => p.currency.toUpperCase() === "IRR",
      ),
      irrDocuments = documents.filter(
        (d) => d.currency.toUpperCase() === "IRR",
      );
    const outstanding = irrPayments.filter((p) =>
        OUTSTANDING.includes(p.status),
      ),
      overdue = outstanding.filter((p) => p.dueDate && p.dueDate < today.start),
      paid = irrPayments.filter(
        (p) =>
          p.status === PaymentStatus.PAID &&
          p.paidAt &&
          (!range || this.inRange(p.paidAt, range)),
      );
    const created = irrPayments.filter(
        (p) => !range || this.inRange(p.createdAt, range),
      ),
      due = outstanding.filter((p) => p.dueDate),
      dueToday = due.filter(
        (p) => p.dueDate! >= today.start && p.dueDate! < today.end,
      ),
      next30 = due.filter(
        (p) =>
          p.dueDate! >= today.end &&
          p.dueDate! < new Date(today.end.getTime() + 30 * 86400000),
      );
    const docAt = (
      field: "createdAt" | "issuedAt" | "acceptedAt" | "signedAt",
    ) =>
      irrDocuments.filter(
        (d) => d[field] && (!range || this.inRange(d[field]!, range)),
      );
    const createdDocs = docAt("createdAt"),
      issuedDocs = docAt("issuedAt"),
      acceptedDocs = docAt("acceptedAt"),
      signedDocs = docAt("signedAt");
    const agingDefs = [
      ["NOT_DUE", -Infinity, 0],
      ["DAYS_1_30", 1, 30],
      ["DAYS_31_60", 31, 60],
      ["DAYS_61_90", 61, 90],
      ["DAYS_91_PLUS", 91, Infinity],
    ] as const;
    const aging = agingDefs.map(([key, min, max]) => {
      const rows = due.filter((p) => {
        const days = Math.floor(
          (today.start.getTime() - p.dueDate!.getTime()) / 86400000,
        );
        return days >= min && days <= max;
      });
      return {
        key,
        paymentCount: rows.length,
        amountIrr: this.sum(rows, (p) => p.amount).toString(),
      };
    });
    const owners = this.group(
      payments,
      (p) => p.opportunity.ownerId ?? "UNASSIGNED",
    ).map(([id, rows]) => ({
      ownerId: id === "UNASSIGNED" ? null : id,
      ownerName: rows[0].opportunity.owner?.fullName ?? "Unassigned",
      outstandingAmountIrr: this.sum(
        rows.filter(
          (p) => p.currency === "IRR" && OUTSTANDING.includes(p.status),
        ),
        (p) => p.amount,
      ).toString(),
      collectedAmountIrr: this.sum(
        rows.filter(
          (p) =>
            p.currency === "IRR" &&
            p.status === PaymentStatus.PAID &&
            p.paidAt &&
            (!range || this.inRange(p.paidAt, range)),
        ),
        (p) => p.amount,
      ).toString(),
    }));
    const companies = this.group(payments, (p) => p.opportunity.companyId).map(
      ([id, rows]) => ({
        companyId: id,
        companyName:
          rows[0].opportunity.company.brandName ??
          rows[0].opportunity.company.legalName,
        outstandingAmountIrr: this.sum(
          rows.filter(
            (p) => p.currency === "IRR" && OUTSTANDING.includes(p.status),
          ),
          (p) => p.amount,
        ).toString(),
        collectedAmountIrr: this.sum(
          rows.filter(
            (p) =>
              p.currency === "IRR" &&
              p.status === PaymentStatus.PAID &&
              p.paidAt &&
              (!range || this.inRange(p.paidAt, range)),
          ),
          (p) => p.amount,
        ).toString(),
      }),
    );
    const currencies = [
      ...new Set(
        [
          ...payments.map((p) => p.currency),
          ...documents.map((d) => d.currency),
        ].filter((c) => c.toUpperCase() !== "IRR"),
      ),
    ];
    return {
      period: this.period(range),
      current: {
        outstandingAmountIrr: this.sum(outstanding, (p) => p.amount).toString(),
        outstandingPaymentCount: outstanding.length,
        overdueAmountIrr: this.sum(overdue, (p) => p.amount).toString(),
        overduePaymentCount: overdue.length,
        dueTodayAmountIrr: this.sum(dueToday, (p) => p.amount).toString(),
        dueTodayPaymentCount: dueToday.length,
        dueNextThirtyDaysAmountIrr: this.sum(
          next30,
          (p) => p.amount,
        ).toString(),
        dueNextThirtyDaysPaymentCount: next30.length,
      },
      periodFlow: {
        paymentCreatedAmountIrr: this.sum(created, (p) => p.amount).toString(),
        paymentCreatedCount: created.length,
        collectedAmountIrr: this.sum(paid, (p) => p.amount).toString(),
        collectedPaymentCount: paid.length,
        documentCreatedAmountIrr: this.sum(
          createdDocs,
          (d) => d.amount,
        ).toString(),
        documentCreatedCount: createdDocs.length,
        documentIssuedAmountIrr: this.sum(
          issuedDocs,
          (d) => d.amount,
        ).toString(),
        documentIssuedCount: issuedDocs.length,
        documentAcceptedAmountIrr: this.sum(
          acceptedDocs,
          (d) => d.amount,
        ).toString(),
        documentAcceptedCount: acceptedDocs.length,
        documentSignedAmountIrr: this.sum(
          signedDocs,
          (d) => d.amount,
        ).toString(),
        documentSignedCount: signedDocs.length,
        collectionRate: this.percentage(
          this.sum(paid, (p) => p.amount),
          this.sum(created, (p) => p.amount),
        ),
      },
      aging,
      trend: this.financialTrend(created, paid, due, range, now),
      byOwner: owners,
      byCompany: companies,
      excludedCurrencies: currencies.map((currency) => ({
        currency,
        paymentCount: payments.filter((p) => p.currency === currency).length,
        documentCount: documents.filter((d) => d.currency === currency).length,
      })),
    };
  }

  async products(f: AdvancedReportFiltersDto, user: CurrentUserPayload) {
    const range = this.range(f),
      base = this.scope(f, user),
      productFilter: Prisma.OpportunityLineItemWhereInput = {
        ...(f.productIds?.length && { productId: { in: f.productIds } }),
        ...(f.salesChannels?.length && {
          salesChannel: { in: f.salesChannels },
        }),
        ...(f.categories?.length && {
          product: { category: { in: f.categories } },
        }),
      };
    const [won, active] = await Promise.all([
      this.prisma.opportunityLineItem.findMany({
        where: {
          AND: [
            productFilter,
            {
              opportunity: {
                AND: [
                  base,
                  {
                    wonAt: range ?? { not: null },
                    stage: { terminalType: "WON" },
                  },
                ],
              },
            },
          ],
        },
        select: this.lineSelect(),
      }),
      this.prisma.opportunityLineItem.findMany({
        where: {
          AND: [productFilter, { opportunity: this.scope(f, user, true) }],
        },
        select: this.lineSelect(),
      }),
    ]);
    const wonOpps = new Set(won.map((x) => x.opportunityId)),
      activeOpps = new Set(active.map((x) => x.opportunityId));
    const aggregate = (rows: typeof won) => ({
      opportunityCount: new Set(rows.map((r) => r.opportunityId)).size,
      lineItemCount: rows.length,
      quantity: this.sum(rows, (r) => r.quantity).toString(),
      netLineValueIrr: this.sum(rows, (r) => r.lineTotal).toString(),
    });
    const wonAgg = aggregate(won),
      activeAgg = aggregate(active),
      allProducts = this.group(
        [...won, ...active],
        (r) =>
          r.productId ??
          `CUSTOM:${r.productCodeSnapshot}:${r.productNameSnapshot}`,
      );
    const byProduct = allProducts.map(([, rows]) => {
      const w = won.filter((x) => this.sameProduct(x, rows[0])),
        a = active.filter((x) => this.sameProduct(x, rows[0]));
      return {
        productId: rows[0].productId,
        productCode: rows[0].productCodeSnapshot,
        productName: rows[0].productNameSnapshot,
        category: rows[0].product?.category ?? null,
        wonOpportunityCount: new Set(w.map((x) => x.opportunityId)).size,
        wonLineItemCount: w.length,
        wonQuantity: this.sum(w, (x) => x.quantity).toString(),
        wonNetValueIrr: this.sum(w, (x) => x.lineTotal).toString(),
        activePipelineQuantity: this.sum(a, (x) => x.quantity).toString(),
        activePipelineNetValueIrr: this.sum(a, (x) => x.lineTotal).toString(),
      };
    });
    const byChannel = Object.values(SalesChannel).map((salesChannel) => {
      const rows = won.filter((x) => x.salesChannel === salesChannel),
        net = this.sum(rows, (x) => x.lineTotal);
      return {
        salesChannel,
        opportunityCount: new Set(rows.map((x) => x.opportunityId)).size,
        lineItemCount: rows.length,
        quantity: this.sum(rows, (x) => x.quantity).toString(),
        netValueIrr: net.toString(),
        percentage: this.percentage(
          net,
          this.sum(won, (x) => x.lineTotal),
        ),
      };
    });
    return {
      period: { ...this.period(range), wonDateBasis: "OPPORTUNITY_WON_AT" },
      wonSales: {
        ...wonAgg,
        grossLineValueIrr: this.sum(won, (x) =>
          this.decimal(x.quantity).mul(x.unitPrice),
        ).toString(),
        discountAmountIrr: this.sum(won, (x) => x.discountAmount).toString(),
        taxAmountIrr: this.sum(won, (x) => x.taxAmount).toString(),
      },
      activePipeline: activeAgg,
      byProduct,
      byChannel,
      trend: this.productTrend(won, range, new Date()),
      _counts: {
        wonOpportunityCount: wonOpps.size,
        activeOpportunityCount: activeOpps.size,
      },
    };
  }

  async exchangeImpact(f: AdvancedReportFiltersDto) {
    const range = this.range(f),
      productWhere = {
        isActive: true,
        ...(f.productIds?.length && { id: { in: f.productIds } }),
        ...(f.categories?.length && { category: { in: f.categories } }),
      };
    const current = await this.prisma.currencyExchangeRate.findFirst({
      where: { validTo: null, validFrom: { lte: new Date() } },
      orderBy: { validFrom: "desc" },
    });
    const [rates, usdCount, irrCount, staleCount, histories] =
      await Promise.all([
        this.prisma.currencyExchangeRate.findMany({
          where: { ...(range && { validFrom: range }) },
          orderBy: { validFrom: "asc" },
        }),
        this.prisma.productCatalogItem.count({
          where: { ...productWhere, pricingCurrency: "USD" },
        }),
        this.prisma.productCatalogItem.count({
          where: { ...productWhere, pricingCurrency: "IRR" },
        }),
        this.prisma.productCatalogItem.count({
          where: {
            ...productWhere,
            pricingCurrency: "USD",
            ...(current
              ? {
                  OR: [
                    { calculatedExchangeRateId: { not: current.id } },
                    { calculatedExchangeRateId: null },
                  ],
                }
              : {}),
          },
        }),
        this.prisma.productPriceHistory.findMany({
          where: {
            reason: ProductPriceHistoryReason.EXCHANGE_RATE_CHANGED,
            product: productWhere,
            ...(range && { validFrom: range }),
          },
          include: {
            product: {
              select: { id: true, code: true, name: true, category: true },
            },
            calculatedExchangeRate: { select: { rate: true } },
          },
          orderBy: [{ validFrom: "desc" }, { id: "desc" }],
        }),
      ]);
    const impacts = await Promise.all(
      histories.map(async (h) => ({
        history: h,
        previous: await this.prisma.productPriceHistory.findFirst({
          where: { productId: h.productId, validFrom: { lt: h.validFrom } },
          orderBy: [{ validFrom: "desc" }, { id: "desc" }],
        }),
      })),
    );
    const mapped = impacts.map(({ history: h, previous: p }) => ({
      productId: h.productId,
      productCode: h.product.code,
      productName: h.product.name,
      category: h.product.category,
      exchangeRateId: h.calculatedExchangeRateId!,
      previousExchangeRate: p?.exchangeRateValueSnapshot?.toString() ?? null,
      exchangeRate:
        h.exchangeRateValueSnapshot?.toString() ??
        h.calculatedExchangeRate?.rate.toString() ??
        "0",
      previousInPersonPriceIrr: p?.inPersonPriceIrr.toString() ?? null,
      inPersonPriceIrr: h.inPersonPriceIrr.toString(),
      inPersonDeltaIrr: p
        ? h.inPersonPriceIrr.minus(p.inPersonPriceIrr).toString()
        : null,
      previousDigikalaPriceIrr: p?.digikalaPriceIrr.toString() ?? null,
      digikalaPriceIrr: h.digikalaPriceIrr.toString(),
      digikalaDeltaIrr: p
        ? h.digikalaPriceIrr.minus(p.digikalaPriceIrr).toString()
        : null,
      effectiveFrom: h.validFrom.toISOString(),
    }));
    const page = f.page ?? 1,
      limit = f.limit ?? 20,
      total = mapped.length,
      pageRows = mapped.slice((page - 1) * limit, page * limit);
    const history = rates.map((rate, index) => {
      const prior = rates[index - 1],
        rows = impacts.filter(
          (x) => x.history.calculatedExchangeRateId === rate.id && x.previous,
        );
      return {
        exchangeRateId: rate.id,
        rate: rate.rate.toString(),
        validFrom: rate.validFrom.toISOString(),
        validTo: rate.validTo?.toISOString() ?? null,
        previousRate: prior?.rate.toString() ?? null,
        changePercent: prior
          ? this.percentage(rate.rate.minus(prior.rate), prior.rate)
          : null,
        affectedProductCount: impacts.filter(
          (x) => x.history.calculatedExchangeRateId === rate.id,
        ).length,
        aggregateInPersonDeltaIrr: this.sum(rows, (x) =>
          x.history.inPersonPriceIrr.minus(x.previous!.inPersonPriceIrr),
        ).toString(),
        aggregateDigikalaDeltaIrr: this.sum(rows, (x) =>
          x.history.digikalaPriceIrr.minus(x.previous!.digikalaPriceIrr),
        ).toString(),
      };
    });
    const previousRate = current
      ? await this.prisma.currencyExchangeRate.findFirst({
          where: { validFrom: { lt: current.validFrom } },
          orderBy: { validFrom: "desc" },
        })
      : null;
    return {
      period: { ...this.period(range), dateBasis: "EXCHANGE_RATE_VALID_FROM" },
      current: {
        currentRate: current?.rate.toString() ?? null,
        currentValidFrom: current?.validFrom.toISOString() ?? null,
        previousRate: previousRate?.rate.toString() ?? null,
        rateChangePercent:
          current && previousRate
            ? this.percentage(
                current.rate.minus(previousRate.rate),
                previousRate.rate,
              )
            : null,
        usdProductCount: usdCount,
        irrProductCount: irrCount,
        staleUsdProductCount: staleCount,
      },
      history,
      productImpacts: {
        data: pageRows,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrevious: page > 1,
        },
      },
    };
  }

  private lineSelect() {
    return {
      id: true,
      opportunityId: true,
      productId: true,
      productCodeSnapshot: true,
      productNameSnapshot: true,
      salesChannel: true,
      quantity: true,
      unitPrice: true,
      discountAmount: true,
      taxAmount: true,
      lineTotal: true,
      product: { select: { category: true } },
      opportunity: { select: { wonAt: true } },
    } as const;
  }
  private sameProduct(
    a: {
      productId: string | null;
      productCodeSnapshot: string;
      productNameSnapshot: string;
    },
    b: {
      productId: string | null;
      productCodeSnapshot: string;
      productNameSnapshot: string;
    },
  ) {
    return a.productId
      ? a.productId === b.productId
      : !b.productId &&
          a.productCodeSnapshot === b.productCodeSnapshot &&
          a.productNameSnapshot === b.productNameSnapshot;
  }
  private inRange(date: Date, range: { gte?: Date; lte?: Date; lt?: Date }) {
    return (
      (!range.gte || date >= range.gte) &&
      (!range.lte || date <= range.lte) &&
      (!range.lt || date < range.lt)
    );
  }
  private group<T>(rows: T[], key: (row: T) => string) {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const k = key(row);
      map.set(k, [...(map.get(k) ?? []), row]);
    }
    return [...map.entries()];
  }
  private buckets(
    range: ReturnType<CommercialReportsService["range"]>,
    now: Date,
  ) {
    const end = range?.lt ?? range?.lte ?? now,
      start = range?.gte ?? new Date(end.getTime() - 30 * 86400000),
      step =
        Math.ceil((end.getTime() - start.getTime()) / 86400000) <= 31 ? 1 : 7,
      out = [] as Array<{ start: Date; end: Date }>;
    for (let d = start; d < end; d = new Date(d.getTime() + step * 86400000))
      out.push({
        start: d,
        end: new Date(Math.min(end.getTime(), d.getTime() + step * 86400000)),
      });
    return out;
  }
  private financialTrend(
    created: any[],
    paid: any[],
    due: any[],
    range: any,
    now: Date,
  ) {
    return this.buckets(range, now).map((b) => ({
      periodStart: b.start.toISOString(),
      periodEnd: b.end.toISOString(),
      collectedAmountIrr: this.sum(
        paid.filter((x) => x.paidAt >= b.start && x.paidAt < b.end),
        (x) => x.amount,
      ).toString(),
      createdReceivableAmountIrr: this.sum(
        created.filter((x) => x.createdAt >= b.start && x.createdAt < b.end),
        (x) => x.amount,
      ).toString(),
      dueAmountIrr: this.sum(
        due.filter((x) => x.dueDate >= b.start && x.dueDate < b.end),
        (x) => x.amount,
      ).toString(),
    }));
  }
  private productTrend(rows: any[], range: any, now: Date) {
    return this.buckets(range, now).map((b) => {
      const x = rows.filter(
        (r) => r.opportunity.wonAt >= b.start && r.opportunity.wonAt < b.end,
      );
      return {
        periodStart: b.start.toISOString(),
        periodEnd: b.end.toISOString(),
        opportunityCount: new Set(x.map((r) => r.opportunityId)).size,
        quantity: this.sum(x, (r) => r.quantity).toString(),
        netValueIrr: this.sum(x, (r) => r.lineTotal).toString(),
      };
    });
  }
}
