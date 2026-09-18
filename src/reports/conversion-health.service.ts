import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { OwnershipScope } from "../common/dto/ownership-scope.dto";
import { parseApiDateRange } from "../common/dates/api-date.util";
import { userTeamScopeWhere } from "../common/tenant/team-scope.util";
import { getCurrentOrganizationId } from "../common/tenant/tenant-scope.util";
import { PrismaService } from "../prisma/prisma.service";
import { ReportFiltersDto } from "./dto/report-filters.dto";

const MILESTONES = [
  { key: "engagement", label: "تعامل اولیه", codes: ["LEAD", "CONTACTED", "INTERESTED"] },
  { key: "qualification", label: "احراز صلاحیت", codes: ["QUALIFIED", "NEEDS_ASSESSMENT"] },
  { key: "commercial", label: "تجاری", codes: ["PENDING_PRE_INVOICE_APPROVAL"] },
  { key: "pilot", label: "پایلوت / POC", codes: ["POC_PILOT_SCHEDULED", "POC_PILOT_IN_PROGRESS", "PENDING_POC_PILOT_APPROVAL"] },
  { key: "delivery", label: "پرداخت / تحویل", codes: ["PENDING_PAYMENT_INVOICE_APPROVAL", "INSTALLATION_SCHEDULED", "INSTALLATION_IN_PROGRESS"] },
  { key: "acceptance", label: "پذیرش مشتری", codes: ["PENDING_CUSTOMER_ACCEPTANCE"] },
  { key: "won", label: "مشتری", codes: ["DONE"] },
] as const;

type CohortOpportunity = {
  id: string;
  createdAt: Date;
  wonAt: Date | null;
  lostAt: Date | null;
  estimatedValue: Prisma.Decimal | null;
  owner: { id: string; fullName: string } | null;
  stage: { code: string; label: string; isTerminal: boolean; terminalType: string | null };
  stageHistories: Array<{
    changedAt: Date;
    fromStage: { code: string; terminalType: string | null } | null;
    toStage: { code: string; label: string; terminalType: string | null };
  }>;
};

@Injectable()
export class ConversionHealthService {
  constructor(private prisma: PrismaService) {}

  private percent(part: number, total: number) {
    return total ? Math.round((part / total) * 1000) / 10 : 0;
  }

  private round(value: number, digits = 1) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  private median(values: number[]) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  private ownershipWhere(scope: OwnershipScope | undefined, user: CurrentUserPayload): Prisma.OpportunityWhereInput {
    switch (scope ?? OwnershipScope.ALL) {
      case OwnershipScope.MINE:
        return { OR: [{ ownerId: user.userId }, { company: { ownerId: user.userId } }] };
      case OwnershipScope.TEAM:
        return { owner: userTeamScopeWhere(user) };
      case OwnershipScope.UNASSIGNED:
        return { ownerId: null };
      default:
        return {};
    }
  }

  private resolvePeriod(filters: ReportFiltersDto) {
    const explicit = parseApiDateRange(filters.startDate, filters.endDate, "startDate", "endDate");
    if (explicit?.gte || explicit?.lte) {
      const end = explicit.lte ?? new Date();
      const start = explicit.gte ?? new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { start, end, isDefault: false };
    }
    const end = new Date();
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { start, end, isDefault: true };
  }

  private previousPeriod(start: Date, end: Date) {
    const span = Math.max(1, end.getTime() - start.getTime());
    return { start: new Date(start.getTime() - span), end: new Date(start.getTime() - 1) };
  }

  private async loadCohort(filters: ReportFiltersDto, user: CurrentUserPayload, start: Date, end: Date): Promise<CohortOpportunity[]> {
    const and: Prisma.OpportunityWhereInput[] = [
      { organizationId: getCurrentOrganizationId(user) },
      { archivedAt: null },
      { company: { archivedAt: null } },
      { createdAt: { gte: start, lte: end } },
      this.ownershipWhere(filters.ownershipScope, user),
    ];
    if (filters.ownerIds?.length) and.push({ ownerId: { in: filters.ownerIds } });
    if (filters.companyIds?.length) and.push({ companyId: { in: filters.companyIds } });
    if (filters.priorities?.length) and.push({ priority: { in: filters.priorities } });

    return this.prisma.opportunity.findMany({
      where: { AND: and },
      select: {
        id: true,
        createdAt: true,
        wonAt: true,
        lostAt: true,
        estimatedValue: true,
        owner: { select: { id: true, fullName: true } },
        stage: { select: { code: true, label: true, isTerminal: true, terminalType: true } },
        stageHistories: {
          select: {
            changedAt: true,
            fromStage: { select: { code: true, terminalType: true } },
            toStage: { select: { code: true, label: true, terminalType: true } },
          },
          orderBy: { changedAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  private analyze(rows: CohortOpportunity[], start: Date, end: Date) {
    const total = rows.length;
    const wonIds = new Set<string>();
    const lostIds = new Set<string>();
    const onHoldIds = new Set<string>();
    const activeIds = new Set<string>();
    const timeToWinDays: number[] = [];
    const milestoneReached = new Map<string, Set<string>>();
    MILESTONES.forEach((m) => milestoneReached.set(m.key, new Set()));
    let onHoldEntered = 0;
    let onHoldRecovered = 0;

    const ownerMap = new Map<string, { ownerId: string; ownerName: string; total: number; won: number; pipelineValue: number }>();
    const monthMap = new Map<string, { month: string; leads: number; won: number }>();
    const ensureMonth = (date: Date) => {
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!monthMap.has(key)) monthMap.set(key, { month: key, leads: 0, won: 0 });
      return monthMap.get(key)!;
    };

    for (const row of rows) {
      ensureMonth(row.createdAt).leads += 1;
      const visitedCodes = new Set<string>(["LEAD", row.stage.code, ...row.stageHistories.map((h) => h.toStage.code)]);
      for (const milestone of MILESTONES) {
        if (milestone.codes.some((code) => visitedCodes.has(code))) milestoneReached.get(milestone.key)!.add(row.id);
      }

      const wonHistory = row.stageHistories.find((h) => h.toStage.terminalType === "WON" || h.toStage.code === "DONE");
      const isWon = row.stage.terminalType === "WON" || row.stage.code === "DONE" || Boolean(row.wonAt) || Boolean(wonHistory);
      const isLost = row.stage.terminalType === "LOST" || ["LOST", "NO_RESPONSE"].includes(row.stage.code);
      const isOnHold = row.stage.terminalType === "ON_HOLD" || row.stage.code === "ON_HOLD";

      if (isWon) {
        wonIds.add(row.id);
        const wonDate = row.wonAt ?? wonHistory?.changedAt;
        if (wonDate) {
          const days = (wonDate.getTime() - row.createdAt.getTime()) / 86_400_000;
          if (days >= 0) timeToWinDays.push(days);
          if (wonDate >= start && wonDate <= end) ensureMonth(wonDate).won += 1;
        }
      } else if (isLost) lostIds.add(row.id);
      else if (isOnHold) onHoldIds.add(row.id);
      else activeIds.add(row.id);

      const enteredHold = row.stageHistories.some((h) => h.toStage.code === "ON_HOLD" || h.toStage.terminalType === "ON_HOLD");
      const recovered = row.stageHistories.some((h) => (h.fromStage?.code === "ON_HOLD" || h.fromStage?.terminalType === "ON_HOLD") && h.toStage.terminalType !== "ON_HOLD" && h.toStage.code !== "ON_HOLD");
      if (enteredHold) onHoldEntered += 1;
      if (recovered) onHoldRecovered += 1;

      if (row.owner) {
        const current = ownerMap.get(row.owner.id) ?? { ownerId: row.owner.id, ownerName: row.owner.fullName, total: 0, won: 0, pipelineValue: 0 };
        current.total += 1;
        if (isWon) current.won += 1;
        current.pipelineValue += Number(row.estimatedValue ?? 0);
        ownerMap.set(row.owner.id, current);
      }
    }

    const milestones = MILESTONES.map((m) => {
      const reached = milestoneReached.get(m.key)?.size ?? 0;
      return { key: m.key, label: m.label, reached, reachRate: this.percent(reached, total) };
    });

    let biggestLeakage: { fromKey: string; fromLabel: string; toKey: string; toLabel: string; dropCount: number; dropRate: number } | null = null;
    for (let i = 0; i < milestones.length - 1; i += 1) {
      const from = milestones[i];
      const to = milestones[i + 1];
      if (!from.reached) continue;
      const dropCount = Math.max(0, from.reached - to.reached);
      const dropRate = this.percent(dropCount, from.reached);
      if (!biggestLeakage || dropRate > biggestLeakage.dropRate) biggestLeakage = { fromKey: from.key, fromLabel: from.label, toKey: to.key, toLabel: to.label, dropCount, dropRate };
    }

    const owners = [...ownerMap.values()].map((owner) => ({ ...owner, conversionRate: this.percent(owner.won, owner.total), avgOpportunityValue: owner.total ? Math.round(owner.pipelineValue / owner.total) : 0 })).sort((a, b) => b.pipelineValue - a.pipelineValue).slice(0, 12);

    return {
      total,
      won: wonIds.size,
      lost: lostIds.size,
      onHold: onHoldIds.size,
      active: activeIds.size,
      leadToCustomerRate: this.percent(wonIds.size, total),
      lostRate: this.percent(lostIds.size, total),
      onHoldRate: this.percent(onHoldIds.size, total),
      activeRate: this.percent(activeIds.size, total),
      medianTimeToWinDays: this.round(this.median(timeToWinDays)),
      recoveryRate: this.percent(onHoldRecovered, onHoldEntered),
      onHoldEntered,
      onHoldRecovered,
      milestones,
      biggestLeakage,
      trend: [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
      owners,
    };
  }

  private delta(current: number, previous: number) {
    return { current, previous, delta: this.round(current - previous) };
  }

  async report(filters: ReportFiltersDto, user: CurrentUserPayload) {
    const period = this.resolvePeriod(filters);
    const previous = this.previousPeriod(period.start, period.end);
    const [currentRows, previousRows] = await Promise.all([
      this.loadCohort(filters, user, period.start, period.end),
      this.loadCohort(filters, user, previous.start, previous.end),
    ]);
    const current = this.analyze(currentRows, period.start, period.end);
    const previousAnalysis = this.analyze(previousRows, previous.start, previous.end);

    return {
      definition: {
        cohort: "Opportunityهایی که در بازه انتخابی ایجاد شده‌اند و نتیجه نهایی آن‌ها مستقل از مسیر میانی بررسی می‌شود.",
        conversion: "درصد Opportunityهای Cohort که نهایتاً به Stage با terminalType=WON رسیده‌اند.",
      },
      period: { startDate: period.start.toISOString(), endDate: period.end.toISOString(), defaultedToLast90Days: period.isDefault },
      comparisonPeriod: { startDate: previous.start.toISOString(), endDate: previous.end.toISOString() },
      summary: {
        totalLeads: current.total,
        won: current.won,
        lost: current.lost,
        onHold: current.onHold,
        active: current.active,
        leadToCustomer: this.delta(current.leadToCustomerRate, previousAnalysis.leadToCustomerRate),
        lostRate: this.delta(current.lostRate, previousAnalysis.lostRate),
        medianTimeToWinDays: this.delta(current.medianTimeToWinDays, previousAnalysis.medianTimeToWinDays),
        recoveryRate: this.delta(current.recoveryRate, previousAnalysis.recoveryRate),
      },
      outcomes: [
        { key: "won", label: "مشتری", count: current.won, rate: current.leadToCustomerRate },
        { key: "lost", label: "از دست رفته", count: current.lost, rate: current.lostRate },
        { key: "onHold", label: "متوقف", count: current.onHold, rate: current.onHoldRate },
        { key: "active", label: "در جریان", count: current.active, rate: current.activeRate },
      ],
      milestones: current.milestones,
      biggestLeakage: current.biggestLeakage,
      trend: current.trend,
      owners: current.owners,
      recovery: { enteredOnHold: current.onHoldEntered, recovered: current.onHoldRecovered, rate: current.recoveryRate },
    };
  }
}
