import { BadRequestException, Injectable } from "@nestjs/common";
import {
  MeetingStatus,
  PaymentStatus,
  Prisma,
  SalesChannel,
} from "@prisma/client";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { isDateOnlyString } from "../common/dates/api-date.util";
import {
  organizationDayBounds,
  zonedMidnightUtc,
} from "../common/dates/timezone-boundary.util";
import { getCurrentOrganizationId } from "../common/tenant/tenant-scope.util";
import { PrismaService } from "../prisma/prisma.service";
import {
  ComparisonMode,
  PeriodComparisonDto,
} from "./dto/period-comparison.dto";
import { ReportingScopeService } from "./reporting-scope.service";
type Range = { start: Date; end: Date };
type Raw = {
  opportunities: any[];
  activities: any[];
  meetings: any[];
  tasks: any[];
  payments: any[];
  lines: any[];
};
@Injectable()
export class PeriodComparisonService {
  constructor(
    private prisma: PrismaService,
    private scopes: ReportingScopeService,
  ) {}
  async compare(f: PeriodComparisonDto, user: CurrentUserPayload) {
    const timezone =
        (
          await this.prisma.organization.findUnique({
            where: { id: getCurrentOrganizationId(user) },
            select: { timezone: true },
          })
        )?.timezone ?? "UTC",
      ranges = this.resolve(f, timezone),
      scope = this.scopes.opportunity(f, user);
    const [opportunities, activities, meetings, tasks, payments, lines] =
      await Promise.all([
        this.prisma.opportunity.findMany({
          where: scope,
          select: {
            id: true,
            createdAt: true,
            wonAt: true,
            lostAt: true,
            estimatedValue: true,
          },
        }),
        this.prisma.activity.findMany({
          where: {
            company: { organizationId: getCurrentOrganizationId(user) },
            ...(f.companyIds?.length && { companyId: { in: f.companyIds } }),
          },
          select: { id: true, occurredAt: true, companyId: true },
        }),
        this.prisma.meeting.findMany({
          where: {
            organizationId: getCurrentOrganizationId(user),
            ...(f.companyIds?.length && { companyId: { in: f.companyIds } }),
          },
          select: { id: true, startAt: true, endAt: true, status: true },
        }),
        this.prisma.task.findMany({
          where: {
            organizationId: getCurrentOrganizationId(user),
            ...(f.companyIds?.length && { companyId: { in: f.companyIds } }),
          },
          select: {
            id: true,
            createdAt: true,
            completedAt: true,
            dueAt: true,
            status: true,
          },
        }),
        this.prisma.opportunityPayment.findMany({
          where: { currency: "IRR", opportunity: scope },
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
            paidAt: true,
          },
        }),
        this.prisma.opportunityLineItem.findMany({
          where: { opportunity: scope },
          select: {
            id: true,
            opportunityId: true,
            quantity: true,
            lineTotal: true,
            salesChannel: true,
            opportunity: { select: { wonAt: true } },
          },
        }),
      ]);
    const raw = { opportunities, activities, meetings, tasks, payments, lines },
      current = this.values(raw, ranges.current),
      comparison = this.values(raw, ranges.comparison);
    return {
      currentPeriod: this.out(ranges.current),
      comparisonPeriod: { ...this.out(ranges.comparison), mode: ranges.mode },
      groups: this.groups(current, comparison),
    };
  }
  private values(r: Raw, p: Range) {
    const inside = (d: Date | null) => Boolean(d && d >= p.start && d < p.end),
      created = r.opportunities.filter((o) => inside(o.createdAt)),
      won = r.opportunities.filter((o) => inside(o.wonAt)),
      lost = r.opportunities.filter((o) => inside(o.lostAt)),
      acts = r.activities.filter((a) => inside(a.occurredAt)),
      meetings = r.meetings.filter((m) => inside(m.startAt)),
      completedMeetings = meetings.filter(
        (m) => m.status === MeetingStatus.COMPLETED,
      ),
      executionDenom = meetings.filter(
        (m) =>
          m.status === MeetingStatus.COMPLETED ||
          m.status === MeetingStatus.CANCELLED ||
          (m.status === MeetingStatus.SCHEDULED && m.endAt < new Date()),
      ),
      taskCreated = r.tasks.filter((t) => inside(t.createdAt)),
      taskCompleted = r.tasks.filter((t) => inside(t.completedAt)),
      withDue = taskCompleted.filter((t) => t.dueAt),
      onTime = withDue.filter((t) => t.completedAt <= t.dueAt),
      paid = r.payments.filter(
        (x) => x.status === PaymentStatus.PAID && inside(x.paidAt),
      ),
      receivables = r.payments.filter((x) => inside(x.createdAt)),
      lines = r.lines.filter((x) => inside(x.opportunity.wonAt));
    const sum = (rows: any[], field: string) =>
        rows.reduce((s, x) => s.plus(x[field] ?? 0), new Prisma.Decimal(0)),
      rate = (n: number, d: number) =>
        d ? new Prisma.Decimal(n).div(d).mul(100) : new Prisma.Decimal(0),
      channel = (c: SalesChannel) =>
        sum(
          lines.filter((x) => x.salesChannel === c),
          "lineTotal",
        );
    return {
      createdCount: new Prisma.Decimal(created.length),
      createdValue: sum(created, "estimatedValue"),
      wonCount: new Prisma.Decimal(won.length),
      wonValue: sum(won, "estimatedValue"),
      lostCount: new Prisma.Decimal(lost.length),
      winRate: rate(won.length, won.length + lost.length),
      activities: new Prisma.Decimal(acts.length),
      companiesTouched: new Prisma.Decimal(
        new Set(acts.map((a) => a.companyId)).size,
      ),
      meetingsStarted: new Prisma.Decimal(meetings.length),
      meetingsCompleted: new Prisma.Decimal(completedMeetings.length),
      meetingExecution: rate(completedMeetings.length, executionDenom.length),
      tasksCreated: new Prisma.Decimal(taskCreated.length),
      tasksCompleted: new Prisma.Decimal(taskCompleted.length),
      taskOnTime: rate(onTime.length, withDue.length),
      collectedAmount: sum(paid, "amount"),
      collectedCount: new Prisma.Decimal(paid.length),
      receivableAmount: sum(receivables, "amount"),
      wonProductValue: sum(lines, "lineTotal"),
      wonProductItems: new Prisma.Decimal(lines.length),
      wonProductQuantity: sum(lines, "quantity"),
      inPerson: channel(SalesChannel.IN_PERSON),
      digikala: channel(SalesChannel.DIGIKALA),
      other: channel(SalesChannel.OTHER),
      legacy: channel(SalesChannel.LEGACY_UNKNOWN),
    };
  }
  private groups(c: any, p: any) {
    const metricKeys: Record<string, string> = {
      createdCount: "OPPORTUNITIES_CREATED",
      createdValue: "OPPORTUNITIES_CREATED_VALUE_IRR",
      wonCount: "OPPORTUNITIES_WON",
      wonValue: "OPPORTUNITIES_WON_VALUE_IRR",
      lostCount: "OPPORTUNITIES_LOST",
      winRate: "CLOSED_WIN_RATE",
      activities: "ACTIVITIES_RECORDED",
      companiesTouched: "COMPANIES_TOUCHED",
      meetingsStarted: "MEETINGS_STARTED",
      meetingsCompleted: "MEETINGS_COMPLETED",
      meetingExecution: "MEETING_EXECUTION_RATE",
      tasksCreated: "TASKS_CREATED",
      tasksCompleted: "TASKS_COMPLETED",
      taskOnTime: "TASK_ON_TIME_COMPLETION_RATE",
      collectedAmount: "PAYMENTS_COLLECTED_IRR",
      collectedCount: "PAYMENTS_COLLECTED_COUNT",
      receivableAmount: "RECEIVABLES_CREATED_IRR",
      wonProductValue: "WON_PRODUCT_VALUE_IRR",
      wonProductItems: "WON_LINE_ITEMS",
      wonProductQuantity: "WON_PRODUCT_QUANTITY",
      inPerson: "WON_IN_PERSON_VALUE_IRR",
      digikala: "WON_DIGIKALA_VALUE_IRR",
      other: "WON_OTHER_VALUE_IRR",
      legacy: "WON_LEGACY_UNKNOWN_VALUE_IRR",
    };
    const metric = (
      key: string,
      label: string,
      type: string,
      polarity: string,
      dateBasis: string,
    ) => {
      const a: Prisma.Decimal = c[key],
        b: Prisma.Decimal = p[key],
        diff = a.minus(b),
        percent = b.isZero()
          ? a.isZero()
            ? 0
            : null
          : diff.div(b.abs()).mul(100).toDecimalPlaces(2).toNumber(),
        direction = diff.gt(0) ? "UP" : diff.lt(0) ? "DOWN" : "UNCHANGED",
        isImprovement =
          polarity === "NEUTRAL" || direction === "UNCHANGED"
            ? null
            : (polarity === "HIGHER_IS_BETTER") === (direction === "UP");
      const string = type === "IRR" || type === "DECIMAL";
      return {
        key: metricKeys[key],
        label,
        valueType: type,
        currentValue: string ? a.toString() : a.toNumber(),
        comparisonValue: string ? b.toString() : b.toNumber(),
        absoluteChange: string ? diff.toString() : diff.toNumber(),
        percentChange: percent,
        direction,
        polarity,
        isImprovement,
        dateBasis,
      };
    };
    return [
      {
        key: "SALES",
        title: "Sales",
        metrics: [
          metric(
            "createdCount",
            "Opportunities created",
            "COUNT",
            "HIGHER_IS_BETTER",
            "OPPORTUNITY_CREATED_AT",
          ),
          metric(
            "createdValue",
            "Created value",
            "IRR",
            "HIGHER_IS_BETTER",
            "OPPORTUNITY_CREATED_AT",
          ),
          metric(
            "wonCount",
            "Opportunities won",
            "COUNT",
            "HIGHER_IS_BETTER",
            "OPPORTUNITY_WON_AT",
          ),
          metric(
            "wonValue",
            "Won value",
            "IRR",
            "HIGHER_IS_BETTER",
            "OPPORTUNITY_WON_AT",
          ),
          metric(
            "lostCount",
            "Opportunities lost",
            "COUNT",
            "LOWER_IS_BETTER",
            "OPPORTUNITY_LOST_AT",
          ),
          metric(
            "winRate",
            "Closed win rate",
            "PERCENT",
            "HIGHER_IS_BETTER",
            "OPPORTUNITY_WON_AT_LOST_AT",
          ),
        ],
      },
      {
        key: "ACTIVITIES",
        title: "Activities",
        metrics: [
          metric(
            "activities",
            "Activities",
            "COUNT",
            "HIGHER_IS_BETTER",
            "ACTIVITY_OCCURRED_AT",
          ),
          metric(
            "companiesTouched",
            "Companies touched",
            "COUNT",
            "HIGHER_IS_BETTER",
            "ACTIVITY_OCCURRED_AT",
          ),
        ],
      },
      {
        key: "MEETINGS",
        title: "Meetings",
        metrics: [
          metric(
            "meetingsStarted",
            "Meetings started",
            "COUNT",
            "NEUTRAL",
            "MEETING_START_AT",
          ),
          metric(
            "meetingsCompleted",
            "Meetings completed",
            "COUNT",
            "HIGHER_IS_BETTER",
            "MEETING_START_AT",
          ),
          metric(
            "meetingExecution",
            "Meeting execution rate",
            "PERCENT",
            "HIGHER_IS_BETTER",
            "MEETING_START_AT",
          ),
        ],
      },
      {
        key: "TASKS",
        title: "Tasks",
        metrics: [
          metric(
            "tasksCreated",
            "Tasks created",
            "COUNT",
            "NEUTRAL",
            "TASK_CREATED_AT",
          ),
          metric(
            "tasksCompleted",
            "Tasks completed",
            "COUNT",
            "HIGHER_IS_BETTER",
            "TASK_COMPLETED_AT",
          ),
          metric(
            "taskOnTime",
            "On-time completion rate",
            "PERCENT",
            "HIGHER_IS_BETTER",
            "TASK_COMPLETED_AT",
          ),
        ],
      },
      {
        key: "FINANCE",
        title: "Finance",
        metrics: [
          metric(
            "collectedAmount",
            "Collected amount",
            "IRR",
            "HIGHER_IS_BETTER",
            "PAYMENT_PAID_AT",
          ),
          metric(
            "collectedCount",
            "Collected payments",
            "COUNT",
            "HIGHER_IS_BETTER",
            "PAYMENT_PAID_AT",
          ),
          metric(
            "receivableAmount",
            "Receivables created",
            "IRR",
            "NEUTRAL",
            "PAYMENT_CREATED_AT",
          ),
        ],
      },
      {
        key: "PRODUCTS",
        title: "Products and channels",
        metrics: [
          metric(
            "wonProductValue",
            "Won product net value",
            "IRR",
            "HIGHER_IS_BETTER",
            "OPPORTUNITY_WON_AT",
          ),
          metric(
            "wonProductItems",
            "Won line items",
            "COUNT",
            "HIGHER_IS_BETTER",
            "OPPORTUNITY_WON_AT",
          ),
          metric(
            "wonProductQuantity",
            "Won quantity",
            "DECIMAL",
            "HIGHER_IS_BETTER",
            "OPPORTUNITY_WON_AT",
          ),
          metric(
            "inPerson",
            "Won in-person value",
            "IRR",
            "NEUTRAL",
            "OPPORTUNITY_WON_AT",
          ),
          metric(
            "digikala",
            "Won Digikala value",
            "IRR",
            "NEUTRAL",
            "OPPORTUNITY_WON_AT",
          ),
          metric(
            "other",
            "Won other value",
            "IRR",
            "NEUTRAL",
            "OPPORTUNITY_WON_AT",
          ),
          metric(
            "legacy",
            "Won legacy-unknown value",
            "IRR",
            "NEUTRAL",
            "OPPORTUNITY_WON_AT",
          ),
        ],
      },
    ];
  }
  private resolve(f: PeriodComparisonDto, tz: string) {
    const current =
        f.startDate || f.endDate
          ? this.input(f.startDate, f.endDate, tz)
          : this.defaultRange(tz),
      mode = f.comparisonMode ?? ComparisonMode.PREVIOUS_PERIOD;
    let comparison: Range;
    if (mode === ComparisonMode.CUSTOM) {
      if (!f.compareStartDate || !f.compareEndDate)
        throw new BadRequestException(
          "compareStartDate and compareEndDate are required for CUSTOM",
        );
      comparison = this.input(f.compareStartDate, f.compareEndDate, tz);
    } else if (mode === ComparisonMode.PREVIOUS_PERIOD) {
      const span = current.end.getTime() - current.start.getTime();
      comparison = {
        start: new Date(current.start.getTime() - span),
        end: current.start,
      };
    } else {
      comparison = {
        start: this.shiftYear(current.start, tz),
        end: this.shiftYear(current.end, tz),
      };
    }
    if (comparison.start < current.end && comparison.end > current.start)
      throw new BadRequestException("Comparison periods must not overlap");
    return { current, comparison, mode };
  }
  private input(
    start: string | undefined,
    end: string | undefined,
    tz: string,
  ): Range {
    if (!start || !end)
      throw new BadRequestException(
        "startDate and endDate must be provided together",
      );
    const s = this.boundary(start, tz, false),
      e = this.boundary(end, tz, true);
    if (s >= e) throw new BadRequestException("Invalid report period");
    return { start: s, end: e };
  }
  private boundary(value: string, tz: string, end: boolean) {
    if (!isDateOnlyString(value)) return new Date(value);
    const [y, m, d] = value.split("-").map(Number),
      date = new Date(Date.UTC(y, m - 1, d + (end ? 1 : 0)));
    return zonedMidnightUtc(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      tz,
    );
  }
  private defaultRange(tz: string) {
    const now = new Date(),
      today = organizationDayBounds(now, tz).start,
      parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(today),
      get = (x: string) => Number(parts.find((p) => p.type === x)?.value),
      d = new Date(Date.UTC(get("year"), get("month") - 1, get("day") - 30));
    return {
      start: zonedMidnightUtc(
        d.getUTCFullYear(),
        d.getUTCMonth() + 1,
        d.getUTCDate(),
        tz,
      ),
      end: now,
    };
  }
  private shiftYear(date: Date, tz: string) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date),
      get = (x: string) => Number(parts.find((p) => p.type === x)?.value),
      year = get("year") - 1,
      month = get("month"),
      day = Math.min(
        get("day"),
        new Date(Date.UTC(year, month, 0)).getUTCDate(),
      );
    return zonedMidnightUtc(year, month, day, tz);
  }
  private out(r: Range) {
    return { startDate: r.start.toISOString(), endDate: r.end.toISOString() };
  }
}
