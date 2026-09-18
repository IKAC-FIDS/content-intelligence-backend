import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import {
  CommercialDocumentStatus,
  PaymentStatus,
  Prisma,
  TaskStatus,
  UserRole,
} from "@prisma/client";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { OwnershipScope } from "../common/dto/ownership-scope.dto";
import { getCurrentOrganizationId } from "../common/tenant/tenant-scope.util";
import {
  userTeamFilterWhere,
  userTeamScopeWhere,
} from "../common/tenant/team-scope.util";
import { PrismaService } from "../prisma/prisma.service";
import {
  DATA_QUALITY_RULE_MAP,
  DATA_QUALITY_RULES,
} from "./data-quality-rules";
import {
  DataQualityIssuesQueryDto,
  DataQualityQueryDto,
  ReportingScope,
} from "./dto/data-quality.dto";
import { ReportingScopeService } from "./reporting-scope.service";

type Item = {
  id: string;
  entityType: string;
  title: string;
  subtitle: string | null;
  company: { id: string; legalName: string; brandName: string | null } | null;
  owner: { id: string; fullName: string } | null;
  data: Record<string, any>;
};
@Injectable()
export class DataQualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ReportingScopeService,
  ) {}
  async report(query: DataQualityQueryDto, user: CurrentUserPayload) {
    const canCatalog = await this.hasPermission(user, "product:view");
    const snapshot = await this.snapshot(query, user, canCatalog);
    return {
      asOf: snapshot.asOf,
      organization: this.section(
        snapshot.items,
        ReportingScope.ORGANIZATION,
        query,
      ),
      globalCatalog: canCatalog
        ? this.section(snapshot.items, ReportingScope.GLOBAL_CATALOG, query)
        : null,
    };
  }
  async issues(query: DataQualityIssuesQueryDto, user: CurrentUserPayload) {
    const rule = DATA_QUALITY_RULE_MAP.get(query.ruleKey);
    if (!rule) throw new BadRequestException("Invalid data-quality ruleKey");
    if (
      rule.scope === ReportingScope.GLOBAL_CATALOG &&
      !(await this.hasPermission(user, "product:view"))
    )
      throw new ForbiddenException(
        "product:view is required for global catalog quality",
      );
    const snapshot = await this.snapshot(
      query,
      user,
      rule.scope === ReportingScope.GLOBAL_CATALOG,
    );
    const issues = snapshot.items.filter(
      (item) =>
        item.entityType === rule.entityType &&
        this.failed(rule.ruleKey, item.data),
    );
    const page = query.page ?? 1,
      limit = query.limit ?? 20,
      total = issues.length,
      totalPages = Math.ceil(total / limit);
    return {
      asOf: snapshot.asOf,
      rule,
      data: issues.slice((page - 1) * limit, page * limit).map((item) => ({
        entityId: item.id,
        entityType: item.entityType,
        scope: rule.scope,
        title: item.title,
        subtitle: item.subtitle,
        company: item.company,
        owner: item.owner,
        fieldNames: rule.fieldNames,
        message: rule.description,
        routeHint: this.route(rule.entityType, item.id, item.company?.id),
        detectedAt: snapshot.asOf,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }
  private section(
    items: Item[],
    scope: ReportingScope,
    q: DataQualityQueryDto,
  ) {
    const rules = DATA_QUALITY_RULES.filter(
      (r) =>
        r.scope === scope &&
        (!q.ruleKeys?.length || q.ruleKeys.includes(r.ruleKey)) &&
        (!q.entityTypes?.length || q.entityTypes.includes(r.entityType)) &&
        (!q.severities?.length || q.severities.includes(r.severity)),
    );
    const results = rules.map((rule) => {
      const eligible = items.filter((i) => i.entityType === rule.entityType),
        issues = eligible.filter((i) =>
          this.failed(rule.ruleKey, i.data),
        ).length;
      return {
        ...rule,
        eligibleCount: eligible.length,
        issueCount: issues,
        passRate: this.score(eligible.length - issues, eligible.length),
      };
    });
    const eligibleChecks = results.reduce((n, r) => n + r.eligibleCount, 0),
      issueOccurrences = results.reduce((n, r) => n + r.issueCount, 0),
      passedChecks = eligibleChecks - issueOccurrences;
    const entityTypes = [...new Set(results.map((r) => r.entityType))];
    return {
      score: {
        overall: this.score(passedChecks, eligibleChecks),
        eligibleChecks,
        passedChecks,
        issueOccurrences,
      },
      byEntityType: entityTypes.map((entityType) => {
        const rows = results.filter((r) => r.entityType === entityType),
          eligible = rows.reduce((n, r) => n + r.eligibleCount, 0),
          issues = rows.reduce((n, r) => n + r.issueCount, 0);
        return {
          entityType,
          eligibleChecks: eligible,
          issueOccurrences: issues,
          score: this.score(eligible - issues, eligible),
        };
      }),
      bySeverity: ["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((severity) => ({
        severity,
        issueOccurrences: results
          .filter((r) => r.severity === severity)
          .reduce((n, r) => n + r.issueCount, 0),
      })),
      rules: results,
    };
  }
  private async snapshot(
    q: DataQualityQueryDto | DataQualityIssuesQueryDto,
    user: CurrentUserPayload,
    includeCatalog: boolean,
  ) {
    const asOf = new Date().toISOString(),
      org = getCurrentOrganizationId(user),
      companyWhere = this.scopes.company(q, user),
      opportunityWhere = this.scopes.opportunity(q, user, true);
    const [
      companies,
      opportunities,
      tasks,
      meetings,
      payments,
      documents,
      currentRate,
      products,
    ] = await Promise.all([
      this.prisma.company.findMany({
        where: companyWhere,
        select: {
          id: true,
          legalName: true,
          brandName: true,
          ownerId: true,
          owner: { select: { id: true, fullName: true } },
          industryId: true,
          industry: true,
          sourceId: true,
          source: true,
          nationalId: true,
          publicEmail: true,
          centralPhone: true,
          people: {
            where: { isPrimaryContact: true },
            select: {
              email: true,
              phone: true,
              contacts: { select: { value: true } },
            },
            take: 1,
          },
        },
      }),
      this.prisma.opportunity.findMany({
        where: opportunityWhere,
        select: {
          id: true,
          title: true,
          ownerId: true,
          owner: { select: { id: true, fullName: true } },
          company: { select: { id: true, legalName: true, brandName: true } },
          estimatedValue: true,
          probability: true,
          expectedCloseDate: true,
          primaryContactId: true,
          stageId: true,
          _count: { select: { lineItems: true } },
          stageHistories: { select: { toStageId: true } },
        },
      }),
      this.prisma.task.findMany({
        where: {
          AND: [
            {
              organizationId: org,
              status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
            },
            ...this.taskFilters(q, user),
          ],
        },
        select: {
          id: true,
          title: true,
          assignedToId: true,
          dueAt: true,
          assignedTo: { select: { id: true, fullName: true } },
          company: { select: { id: true, legalName: true, brandName: true } },
        },
      }),
      this.prisma.meeting.findMany({
        where: {
          AND: [
            {
              organizationId: org,
              status: "SCHEDULED",
              endAt: { lt: new Date() },
            },
            ...this.meetingFilters(q, user),
          ],
        },
        select: {
          id: true,
          title: true,
          endAt: true,
          organizer: { select: { id: true, fullName: true } },
          company: { select: { id: true, legalName: true, brandName: true } },
        },
      }),
      this.prisma.opportunityPayment.findMany({
        where: { opportunity: opportunityWhere },
        select: {
          id: true,
          status: true,
          paidAt: true,
          dueDate: true,
          opportunity: {
            select: {
              title: true,
              owner: { select: { id: true, fullName: true } },
              company: {
                select: { id: true, legalName: true, brandName: true },
              },
            },
          },
        },
      }),
      this.prisma.opportunityCommercialDocument.findMany({
        where: { opportunity: opportunityWhere },
        select: {
          id: true,
          title: true,
          status: true,
          amount: true,
          opportunity: {
            select: {
              owner: { select: { id: true, fullName: true } },
              company: {
                select: { id: true, legalName: true, brandName: true },
              },
            },
          },
        },
      }),
      includeCatalog
        ? this.prisma.currencyExchangeRate.findFirst({
            where: { validTo: null, validFrom: { lte: new Date() } },
            select: { id: true },
            orderBy: { validFrom: "desc" },
          })
        : null,
      includeCatalog
        ? this.prisma.productCatalogItem.findMany({
            where: { isActive: true },
            select: {
              id: true,
              code: true,
              name: true,
              category: true,
              pricingCurrency: true,
              inPersonPriceIrr: true,
              digikalaPriceIrr: true,
              calculatedExchangeRateId: true,
            },
          })
        : [],
    ]);
    const company = (c: any) => ({
      id: c.id,
      legalName: c.legalName,
      brandName: c.brandName,
    });
    const items: Item[] = [];
    for (const c of companies)
      items.push({
        id: c.id,
        entityType: "COMPANY",
        title: c.brandName ?? c.legalName,
        subtitle: null,
        company: company(c),
        owner: c.owner,
        data: {
          ...c,
          hasPrimary: c.people.length > 0,
          hasContact: Boolean(
            c.publicEmail?.trim() ||
            c.centralPhone?.trim() ||
            c.people.some(
              (p: any) =>
                p.email?.trim() ||
                p.phone?.trim() ||
                p.contacts.some((x: any) => x.value?.trim()),
            ),
          ),
        },
      });
    for (const o of opportunities)
      items.push({
        id: o.id,
        entityType: "OPPORTUNITY",
        title: o.title,
        subtitle: o.company.brandName ?? o.company.legalName,
        company: o.company,
        owner: o.owner,
        data: {
          ...o,
          lineCount: o._count.lineItems,
          hasCurrentHistory: o.stageHistories.some(
            (h) => h.toStageId === o.stageId,
          ),
        },
      });
    for (const t of tasks)
      items.push({
        id: t.id,
        entityType: "TASK",
        title: t.title,
        subtitle: null,
        company: t.company,
        owner: t.assignedTo,
        data: t,
      });
    for (const m of meetings)
      items.push({
        id: m.id,
        entityType: "MEETING",
        title: m.title,
        subtitle: null,
        company: m.company,
        owner: m.organizer,
        data: m,
      });
    for (const p of payments)
      items.push({
        id: p.id,
        entityType: "PAYMENT",
        title: p.opportunity.title,
        subtitle: null,
        company: p.opportunity.company,
        owner: p.opportunity.owner,
        data: p,
      });
    for (const d of documents)
      items.push({
        id: d.id,
        entityType: "COMMERCIAL_DOCUMENT",
        title: d.title,
        subtitle: null,
        company: d.opportunity.company,
        owner: d.opportunity.owner,
        data: d,
      });
    for (const p of products)
      items.push({
        id: p.id,
        entityType: "PRODUCT",
        title: p.name,
        subtitle: p.code,
        company: null,
        owner: null,
        data: { ...p, currentRateId: currentRate?.id ?? null },
      });
    return { asOf, items };
  }
  private failed(key: string, d: any) {
    switch (key) {
      case "COMPANY_MISSING_OWNER":
        return !d.ownerId;
      case "COMPANY_MISSING_INDUSTRY":
        return !d.industryId && !d.industry?.trim();
      case "COMPANY_MISSING_SOURCE":
        return !d.sourceId && !d.source?.trim();
      case "COMPANY_MISSING_PRIMARY_CONTACT":
        return !d.hasPrimary;
      case "COMPANY_MISSING_CONTACT_CHANNEL":
        return !d.hasContact;
      case "COMPANY_MISSING_NATIONAL_ID":
        return !d.nationalId?.trim();
      case "OPPORTUNITY_MISSING_OWNER":
        return !d.ownerId;
      case "OPPORTUNITY_MISSING_ESTIMATED_VALUE":
        return d.estimatedValue == null;
      case "OPPORTUNITY_MISSING_PROBABILITY":
        return d.probability == null;
      case "OPPORTUNITY_MISSING_EXPECTED_CLOSE_DATE":
        return !d.expectedCloseDate;
      case "OPPORTUNITY_MISSING_PRIMARY_CONTACT":
        return !d.primaryContactId;
      case "OPPORTUNITY_WITHOUT_LINE_ITEMS":
        return d.lineCount === 0;
      case "OPPORTUNITY_CURRENT_STAGE_HISTORY_MISSING":
        return !d.hasCurrentHistory;
      case "OPEN_TASK_MISSING_ASSIGNEE":
        return !d.assignedToId;
      case "OPEN_TASK_MISSING_DUE_DATE":
        return !d.dueAt;
      case "PAST_SCHEDULED_MEETING":
        return true;
      case "PAID_PAYMENT_MISSING_PAID_AT":
        return d.status === PaymentStatus.PAID && !d.paidAt;
      case "UNPAID_PAYMENT_HAS_PAID_AT":
        return d.status !== PaymentStatus.PAID && Boolean(d.paidAt);
      case "OPEN_PAYMENT_MISSING_DUE_DATE":
        return (
          [
            PaymentStatus.PENDING,
            PaymentStatus.PARTIAL,
            PaymentStatus.OVERDUE,
          ].includes(d.status) && !d.dueDate
        );
      case "FINAL_DOCUMENT_MISSING_AMOUNT":
        return (
          [
            CommercialDocumentStatus.ACCEPTED,
            CommercialDocumentStatus.SIGNED,
          ].includes(d.status) && d.amount == null
        );
      case "ACTIVE_PRODUCT_NON_POSITIVE_IN_PERSON_PRICE":
        return new Prisma.Decimal(d.inPersonPriceIrr).lte(0);
      case "ACTIVE_PRODUCT_NON_POSITIVE_DIGIKALA_PRICE":
        return new Prisma.Decimal(d.digikalaPriceIrr).lte(0);
      case "USD_PRODUCT_STALE_EXCHANGE_RATE":
        return (
          d.pricingCurrency === "USD" &&
          (!d.currentRateId || d.calculatedExchangeRateId !== d.currentRateId)
        );
      case "PRODUCT_MISSING_CATEGORY":
        return !d.category?.trim();
      default:
        return false;
    }
  }
  private taskFilters(
    q: any,
    user: CurrentUserPayload,
  ): Prisma.TaskWhereInput[] {
    return [
      ...(q.companyIds?.length ? [{ companyId: { in: q.companyIds } }] : []),
      ...(q.ownerIds?.length ? [{ assignedToId: { in: q.ownerIds } }] : []),
      ...(q.teams?.length
        ? [{ assignedTo: userTeamFilterWhere(q.teams) }]
        : []),
      ...(q.ownershipScope === OwnershipScope.MINE
        ? [{ assignedToId: user.userId }]
        : q.ownershipScope === OwnershipScope.TEAM
          ? [{ assignedTo: userTeamScopeWhere(user) }]
          : q.ownershipScope === OwnershipScope.UNASSIGNED
            ? [{ assignedToId: null }]
            : []),
    ];
  }
  private meetingFilters(
    q: any,
    user: CurrentUserPayload,
  ): Prisma.MeetingWhereInput[] {
    return [
      ...(q.companyIds?.length ? [{ companyId: { in: q.companyIds } }] : []),
      ...(q.ownerIds?.length ? [{ organizerId: { in: q.ownerIds } }] : []),
      ...(q.teams?.length ? [{ organizer: userTeamFilterWhere(q.teams) }] : []),
      ...(q.ownershipScope === OwnershipScope.MINE
        ? [{ organizerId: user.userId }]
        : q.ownershipScope === OwnershipScope.TEAM
          ? [{ organizer: userTeamScopeWhere(user) }]
          : []),
    ];
  }
  private score(passed: number, total: number) {
    return total ? Math.round((passed / total) * 10000) / 100 : null;
  }
  private route(type: string, id: string, companyId?: string) {
    return type === "COMPANY"
      ? `/companies/${id}`
      : type === "OPPORTUNITY"
        ? `/opportunities/${id}`
        : type === "PRODUCT"
          ? `/product-catalog/${id}`
          : companyId
            ? `/companies/${companyId}`
            : null;
  }
  private async hasPermission(user: CurrentUserPayload, action: string) {
    const db = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { role: true, roleId: true },
    });
    if (!db) return false;
    return Boolean(
      await this.prisma.rolePermission.findFirst({
        where: db.roleId
          ? { roleId: db.roleId, permission: { action, isActive: true } }
          : {
              role: db.role as UserRole,
              permission: { action, isActive: true },
            },
        select: { id: true },
      }),
    );
  }
}
