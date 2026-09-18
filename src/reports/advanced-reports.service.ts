import { Injectable } from "@nestjs/common";
import { MeetingStatus, Prisma, TaskStatus } from "@prisma/client";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { OwnershipScope } from "../common/dto/ownership-scope.dto";
import { parseApiDateRange } from "../common/dates/api-date.util";
import {
  addOrganizationCalendarDays,
  organizationDayBounds,
} from "../common/dates/timezone-boundary.util";
import { getCurrentOrganizationId } from "../common/tenant/tenant-scope.util";
import {
  userTeamFilterWhere,
  userTeamScopeWhere,
} from "../common/tenant/team-scope.util";
import { PrismaService } from "../prisma/prisma.service";
import { AdvancedReportFiltersDto } from "./dto/advanced-report-filters.dto";
import { ReportingScopeService } from "./reporting-scope.service";

const OPEN_TASKS = [TaskStatus.TODO, TaskStatus.IN_PROGRESS];
@Injectable()
export class AdvancedReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ReportingScopeService,
  ) {}
  private percent(part: number, total: number) {
    return total ? Math.round((part / total) * 100) : 0;
  }
  private money(rows: Array<{ estimatedValue: Prisma.Decimal | null }>) {
    return rows.reduce(
      (sum, row) => sum.plus(row.estimatedValue ?? 0),
      new Prisma.Decimal(0),
    );
  }
  private weighted(
    rows: Array<{
      estimatedValue: Prisma.Decimal | null;
      probability: number | null;
    }>,
  ) {
    return rows.reduce(
      (sum, row) =>
        sum.plus(
          row.estimatedValue
            ? row.estimatedValue.mul(row.probability ?? 0).div(100)
            : 0,
        ),
      new Prisma.Decimal(0),
    );
  }
  private async clock(user: CurrentUserPayload) {
    const now = new Date();
    const org = await this.prisma.organization.findUnique({
      where: { id: getCurrentOrganizationId(user) },
      select: { timezone: true },
    });
    const timezone = org?.timezone || "UTC";
    return { now, timezone, ...organizationDayBounds(now, timezone) };
  }
  private opportunityWhere(
    f: AdvancedReportFiltersDto,
    user: CurrentUserPayload,
  ): Prisma.OpportunityWhereInput {
    return this.scopes.opportunity(f, user, true);
  }
  private taskWhere(
    f: AdvancedReportFiltersDto,
    user: CurrentUserPayload,
  ): Prisma.TaskWhereInput {
    const scope = f.ownershipScope;
    return {
      AND: [
        { organizationId: getCurrentOrganizationId(user) },
        ...(f.companyIds?.length ? [{ companyId: { in: f.companyIds } }] : []),
        ...(f.userIds?.length ? [{ assignedToId: { in: f.userIds } }] : []),
        ...(f.teams?.length
          ? [{ assignedTo: userTeamFilterWhere(f.teams) }]
          : []),
        ...(scope === OwnershipScope.MINE
          ? [{ assignedToId: user.userId }]
          : scope === OwnershipScope.TEAM
            ? [{ assignedTo: userTeamScopeWhere(user) }]
            : scope === OwnershipScope.UNASSIGNED
              ? [{ assignedToId: null }]
              : []),
        ...(f.priorities?.length ? [{ priority: { in: f.priorities } }] : []),
        ...(f.taskStatuses?.length ? [{ status: { in: f.taskStatuses } }] : []),
      ],
    };
  }
  private meetingWhere(
    f: AdvancedReportFiltersDto,
    user: CurrentUserPayload,
  ): Prisma.MeetingWhereInput {
    const scope = f.ownershipScope;
    const userScope =
      scope === OwnershipScope.MINE
        ? {
            OR: [
              { organizerId: user.userId },
              { assignees: { some: { userId: user.userId } } },
            ],
          }
        : scope === OwnershipScope.TEAM
          ? {
              OR: [
                { organizer: userTeamScopeWhere(user) },
                { assignees: { some: { user: userTeamScopeWhere(user) } } },
              ],
            }
          : scope === OwnershipScope.UNASSIGNED
            ? { assignees: { none: {} } }
            : {};
    return {
      AND: [
        { organizationId: getCurrentOrganizationId(user) },
        userScope,
        ...(f.companyIds?.length ? [{ companyId: { in: f.companyIds } }] : []),
        ...(f.userIds?.length
          ? [
              {
                OR: [
                  { organizerId: { in: f.userIds } },
                  { assignees: { some: { userId: { in: f.userIds } } } },
                ],
              },
            ]
          : []),
        ...(f.teams?.length
          ? [
              {
                OR: [
                  { organizer: userTeamFilterWhere(f.teams) },
                  {
                    assignees: { some: { user: userTeamFilterWhere(f.teams) } },
                  },
                ],
              },
            ]
          : []),
        ...(f.meetingStatuses?.length
          ? [{ status: { in: f.meetingStatuses } }]
          : []),
        ...(f.meetingModes?.length ? [{ mode: { in: f.meetingModes } }] : []),
      ],
    };
  }
  private period(
    f: AdvancedReportFiltersDto,
    fallback?: { start: Date; end: Date },
  ) {
    const range = parseApiDateRange(
      f.startDate,
      f.endDate,
      "startDate",
      "endDate",
    );
    return (
      range ??
      (fallback ? { gte: fallback.start, lt: fallback.end } : undefined)
    );
  }

  async forecast(f: AdvancedReportFiltersDto, user: CurrentUserPayload) {
    const { start: today, now, timezone } = await this.clock(user);
    const defaultEnd = addOrganizationCalendarDays(today, 90, timezone);
    const range = this.period(f, { start: today, end: defaultEnd })!;
    const all = await this.prisma.opportunity.findMany({
      where: this.opportunityWhere(f, user),
      select: {
        id: true,
        estimatedValue: true,
        probability: true,
        expectedCloseDate: true,
        stageId: true,
        stage: { select: { code: true, label: true, sortOrder: true } },
        ownerId: true,
        owner: { select: { fullName: true, team: true } },
      },
    });
    const inside = all.filter(
      (o) => o.expectedCloseDate && this.inRange(o.expectedCloseDate, range),
    );
    const overdue = all.filter(
      (o) => o.expectedCloseDate && o.expectedCloseDate < today,
    );
    const missing = all.filter((o) => !o.expectedCloseDate);
    const periods = this.monthBuckets(
      range.gte!,
      range.lt ?? new Date((range.lte ?? defaultEnd).getTime() + 1),
    );
    const group = <T>(
      key: (o: (typeof inside)[number]) => string,
      base: T[],
      make: (k: string, rows: typeof inside) => T,
    ) => {
      const map = new Map<string, typeof inside>();
      inside.forEach((o) => map.set(key(o), [...(map.get(key(o)) ?? []), o]));
      return [...base, ...[...map].map(([k, rows]) => make(k, rows))];
    };
    const byStage = group(
      (o) => o.stageId,
      [],
      (stageId, rows) => ({
        stageId,
        code: rows[0].stage.code,
        label: rows[0].stage.label,
        sortOrder: rows[0].stage.sortOrder,
        opportunityCount: rows.length,
        estimatedValueIrr: this.money(rows).toString(),
        weightedValueIrr: this.weighted(rows).toString(),
      }),
    ).sort((a, b) => a.sortOrder - b.sortOrder);
    const byOwner = group(
      (o) => o.ownerId ?? "UNASSIGNED",
      [],
      (id, rows) => ({
        ownerId: id === "UNASSIGNED" ? null : id,
        ownerName: rows[0].owner?.fullName ?? "Unassigned",
        team: rows[0].owner?.team ?? null,
        opportunityCount: rows.length,
        estimatedValueIrr: this.money(rows).toString(),
        weightedValueIrr: this.weighted(rows).toString(),
      }),
    ).sort((a, b) =>
      new Prisma.Decimal(b.weightedValueIrr).cmp(a.weightedValueIrr),
    );
    return {
      period: {
        startDate: (range.gte ?? today).toISOString(),
        endDate: (range.lt ?? range.lte ?? defaultEnd).toISOString(),
        dateBasis: "EXPECTED_CLOSE_DATE",
      },
      summary: {
        totalActiveOpportunities: all.length,
        forecastOpportunityCount: inside.length,
        estimatedValueIrr: this.money(inside).toString(),
        weightedValueIrr: this.weighted(inside).toString(),
        overdueCloseCount: overdue.length,
        overdueEstimatedValueIrr: this.money(overdue).toString(),
        withoutCloseDateCount: missing.length,
        withoutCloseDateEstimatedValueIrr: this.money(missing).toString(),
        missingValueCount: all.filter((o) => !o.estimatedValue).length,
        missingProbabilityCount: all.filter((o) => o.probability == null)
          .length,
      },
      periods: periods.map((p) => {
        const rows = inside.filter(
          (o) =>
            o.expectedCloseDate &&
            o.expectedCloseDate >= p.start &&
            o.expectedCloseDate < p.end,
        );
        return {
          periodStart: p.start.toISOString(),
          periodEnd: p.end.toISOString(),
          label: p.start.toISOString().slice(0, 7),
          opportunityCount: rows.length,
          estimatedValueIrr: this.money(rows).toString(),
          weightedValueIrr: this.weighted(rows).toString(),
        };
      }),
      byStage,
      byOwner,
      generatedAt: now.toISOString(),
    };
  }

  async aging(f: AdvancedReportFiltersDto, user: CurrentUserPayload) {
    const { now, start: today } = await this.clock(user);
    const opportunities = await this.prisma.opportunity.findMany({
      where: this.opportunityWhere(f, user),
      select: {
        id: true,
        title: true,
        company: { select: { id: true, legalName: true, brandName: true } },
        owner: { select: { id: true, fullName: true, team: true } },
        stage: {
          select: { id: true, code: true, label: true, sortOrder: true },
        },
        stageId: true,
        priority: true,
        estimatedValue: true,
        probability: true,
        expectedCloseDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const histories = opportunities.length
      ? await this.prisma.opportunityStageHistory.findMany({
          where: { opportunityId: { in: opportunities.map((o) => o.id) } },
          select: { opportunityId: true, toStageId: true, changedAt: true },
          orderBy: { changedAt: "desc" },
        })
      : [];
    const entered = new Map<string, Date>();
    histories.forEach((h) => {
      const o = opportunities.find((x) => x.id === h.opportunityId);
      if (o && h.toStageId === o.stageId && !entered.has(o.id))
        entered.set(o.id, h.changedAt);
    });
    const rows = opportunities
      .map((o) => {
        const stageEnteredAt = entered.get(o.id) ?? o.createdAt;
        return {
          ...o,
          stageEnteredAt,
          totalAgeDays: this.days(o.createdAt, now),
          currentStageAgeDays: this.days(stageEnteredAt, now),
          isExpectedCloseOverdue: Boolean(
            o.expectedCloseDate && o.expectedCloseDate < today,
          ),
        };
      })
      .sort(
        (a, b) =>
          b.currentStageAgeDays - a.currentStageAgeDays ||
          (a.expectedCloseDate?.getTime() ?? Infinity) -
            (b.expectedCloseDate?.getTime() ?? Infinity) ||
          a.updatedAt.getTime() - b.updatedAt.getTime(),
      );
    const buckets = [
      ["DAYS_0_7", 0, 7],
      ["DAYS_8_14", 8, 14],
      ["DAYS_15_30", 15, 30],
      ["DAYS_31_60", 31, 60],
      ["DAYS_61_PLUS", 61, null],
    ] as const;
    const page = f.page ?? 1,
      limit = f.limit ?? 20,
      total = rows.length,
      totalPages = Math.ceil(total / limit);
    return {
      asOf: now.toISOString(),
      summary: {
        activeOpportunityCount: total,
        averageTotalAgeDays: this.avg(rows.map((r) => r.totalAgeDays)),
        averageCurrentStageAgeDays: this.avg(
          rows.map((r) => r.currentStageAgeDays),
        ),
        overdueCloseCount: rows.filter((r) => r.isExpectedCloseOverdue).length,
        withoutExpectedCloseDateCount: rows.filter((r) => !r.expectedCloseDate)
          .length,
        estimatedValueIrr: this.money(rows).toString(),
      },
      buckets: buckets.map(([key, min, max]) => {
        const x = rows.filter(
          (r) =>
            r.currentStageAgeDays >= min &&
            (max === null || r.currentStageAgeDays <= max),
        );
        return {
          key,
          minDays: min,
          maxDays: max,
          opportunityCount: x.length,
          estimatedValueIrr: this.money(x).toString(),
        };
      }),
      data: rows.slice((page - 1) * limit, page * limit).map((r) => ({
        ...r,
        estimatedValue: r.estimatedValue?.toString() ?? null,
        stageEnteredAt: r.stageEnteredAt.toISOString(),
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

  async meetingPerformance(
    f: AdvancedReportFiltersDto,
    user: CurrentUserPayload,
  ) {
    const { now } = await this.clock(user);
    const range = this.period(f);
    const where = this.meetingWhere(f, user);
    const meetings = await this.prisma.meeting.findMany({
      where: { AND: [where, ...(range ? [{ startAt: range }] : [])] },
      select: {
        id: true,
        status: true,
        mode: true,
        startAt: true,
        endAt: true,
        organizerId: true,
        organizer: { select: { fullName: true, team: true } },
      },
    });
    const completed = meetings.filter(
        (m) => m.status === MeetingStatus.COMPLETED,
      ),
      cancelled = meetings.filter((m) => m.status === MeetingStatus.CANCELLED),
      past = meetings.filter(
        (m) => m.status === MeetingStatus.SCHEDULED && m.endAt < now,
      ),
      closed = completed.length + cancelled.length,
      execution = closed + past.length;
    const counts = (key: "status" | "mode") =>
      [...new Set(meetings.map((m) => String(m[key])))].map((value) => ({
        [key]: value,
        count: meetings.filter((m) => String(m[key]) === value).length,
      }));
    const organizers = [...new Set(meetings.map((m) => m.organizerId))].map(
      (id) => {
        const x = meetings.filter((m) => m.organizerId === id),
          c = x.filter((m) => m.status === MeetingStatus.COMPLETED).length,
          k = x.filter((m) => m.status === MeetingStatus.CANCELLED).length,
          p = x.filter(
            (m) => m.status === MeetingStatus.SCHEDULED && m.endAt < now,
          ).length;
        return {
          organizerId: id,
          organizerName: x[0].organizer.fullName,
          team: x[0].organizer.team,
          totalCount: x.length,
          completedCount: c,
          cancelledCount: k,
          pastScheduledCount: p,
          executionRate: this.percent(c, c + k + p),
        };
      },
    );
    return {
      period: {
        startDate: range?.gte?.toISOString() ?? null,
        endDate: (range?.lte ?? range?.lt)?.toISOString() ?? null,
        dateBasis: "MEETING_START_AT",
      },
      summary: {
        totalCount: meetings.length,
        scheduledCount: meetings.filter(
          (m) => m.status === MeetingStatus.SCHEDULED,
        ).length,
        completedCount: completed.length,
        cancelledCount: cancelled.length,
        pastScheduledCount: past.length,
        completionRate: this.percent(completed.length, closed),
        executionRate: this.percent(completed.length, execution),
        cancellationRate: this.percent(cancelled.length, closed),
        averagePlannedDurationMinutes: this.avg(
          meetings.map(
            (m) => (m.endAt.getTime() - m.startAt.getTime()) / 60000,
          ),
        ),
      },
      byStatus: counts("status"),
      byMode: counts("mode"),
      byOrganizer: organizers,
      trend: this.trend(meetings, range, "startAt", now),
    };
  }

  async taskPerformance(f: AdvancedReportFiltersDto, user: CurrentUserPayload) {
    const { now, start, end } = await this.clock(user);
    const range = this.period(f);
    const tasks = await this.prisma.task.findMany({
      where: this.taskWhere(f, user),
      select: {
        id: true,
        status: true,
        priority: true,
        createdAt: true,
        dueAt: true,
        completedAt: true,
        cancelledAt: true,
        assignedToId: true,
        assignedTo: { select: { fullName: true, team: true } },
      },
    });
    const open = tasks.filter((t) =>
        OPEN_TASKS.includes(t.status as (typeof OPEN_TASKS)[number]),
      ),
      completedPeriod = tasks.filter(
        (t) => t.completedAt && (!range || this.inRange(t.completedAt, range)),
      ),
      created = tasks.filter((t) => !range || this.inRange(t.createdAt, range)),
      cancelled = tasks.filter(
        (t) => t.cancelledAt && (!range || this.inRange(t.cancelledAt, range)),
      ),
      due = tasks.filter(
        (t) => t.dueAt && (!range || this.inRange(t.dueAt, range)),
      ),
      onTime = completedPeriod.filter(
        (t) => t.dueAt && t.completedAt! <= t.dueAt,
      ),
      late = completedPeriod.filter((t) => t.dueAt && t.completedAt! > t.dueAt);
    const next7 = new Date(end.getTime() + 7 * 86400000);
    const current = {
      openCount: open.length,
      overdueCount: open.filter((t) => t.dueAt && t.dueAt < now).length,
      dueTodayCount: open.filter(
        (t) => t.dueAt && t.dueAt >= start && t.dueAt < end,
      ).length,
      dueNextSevenDaysCount: open.filter(
        (t) => t.dueAt && t.dueAt >= end && t.dueAt < next7,
      ).length,
    };
    const assignees = [
      ...new Set(tasks.map((t) => t.assignedToId ?? "UNASSIGNED")),
    ].map((id) => {
      const x = tasks.filter((t) => (t.assignedToId ?? "UNASSIGNED") === id),
        o = x.filter((t) =>
          OPEN_TASKS.includes(t.status as (typeof OPEN_TASKS)[number]),
        ),
        cp = x.filter(
          (t) =>
            t.completedAt && (!range || this.inRange(t.completedAt, range)),
        ),
        ot = cp.filter((t) => t.dueAt && t.completedAt! <= t.dueAt),
        lt = cp.filter((t) => t.dueAt && t.completedAt! > t.dueAt);
      return {
        userId: id === "UNASSIGNED" ? null : id,
        fullName: x[0].assignedTo?.fullName ?? "Unassigned",
        team: x[0].assignedTo?.team ?? null,
        openCount: o.length,
        overdueCount: o.filter((t) => t.dueAt && t.dueAt < now).length,
        completedInPeriodCount: cp.length,
        onTimeCompletedCount: ot.length,
        lateCompletedCount: lt.length,
        onTimeCompletionRate: this.percent(ot.length, ot.length + lt.length),
      };
    });
    return {
      period: {
        startDate: range?.gte?.toISOString() ?? null,
        endDate: (range?.lte ?? range?.lt)?.toISOString() ?? null,
      },
      current,
      periodFlow: {
        createdCount: created.length,
        completedCount: completedPeriod.length,
        cancelledCount: cancelled.length,
        dueCount: due.length,
        onTimeCompletedCount: onTime.length,
        lateCompletedCount: late.length,
        completedWithoutDueDateCount: completedPeriod.filter((t) => !t.dueAt)
          .length,
        onTimeCompletionRate: this.percent(
          onTime.length,
          onTime.length + late.length,
        ),
        averageCompletionHours: this.avg(
          completedPeriod.map((t) =>
            Math.max(
              0,
              (t.completedAt!.getTime() - t.createdAt.getTime()) / 3600000,
            ),
          ),
        ),
      },
      byPriority: [...new Set(tasks.map((t) => t.priority))].map(
        (priority) => ({
          priority,
          openCount: open.filter((t) => t.priority === priority).length,
          overdueCount: open.filter(
            (t) => t.priority === priority && t.dueAt && t.dueAt < now,
          ).length,
          completedCount: completedPeriod.filter((t) => t.priority === priority)
            .length,
        }),
      ),
      byAssignee: assignees,
      trend: this.trend(tasks, range, "createdAt", now),
    };
  }

  async dashboard(f: AdvancedReportFiltersDto, user: CurrentUserPayload) {
    const clock = await this.clock(user);
    const defaultPeriod = {
      start: new Date(clock.start.getTime() - 30 * 86400000),
      end: clock.now,
    };
    const range = this.period(f, defaultPeriod)!;
    const historicalScope = this.scopes.opportunity(f, user);
    const [
      forecast,
      tasks,
      meetings,
      opportunities,
      createdOpportunities,
      wonOpportunities,
      lostOpportunities,
      overdueOpportunities,
      overdueTasks,
      pastMeetings,
    ] = await Promise.all([
      this.forecast({ ...f, startDate: undefined, endDate: undefined }, user),
      this.taskPerformance(f, user),
      this.meetingPerformance(f, user),
      this.prisma.opportunity.findMany({
        where: this.opportunityWhere(f, user),
        select: { estimatedValue: true, probability: true },
      }),
      this.prisma.opportunity.findMany({
        where: {
          AND: [historicalScope, { createdAt: range }],
        },
        select: { id: true },
      }),
      this.prisma.opportunity.findMany({
        where: {
          AND: [
            historicalScope,
            { wonAt: range, stage: { terminalType: "WON" } },
          ],
        },
        select: { estimatedValue: true },
      }),
      this.prisma.opportunity.findMany({
        where: {
          AND: [
            historicalScope,
            { lostAt: range, stage: { terminalType: "LOST" } },
          ],
        },
        select: { id: true },
      }),
      this.prisma.opportunity.findMany({
        where: {
          AND: [
            this.opportunityWhere(f, user),
            { expectedCloseDate: { lt: clock.start } },
          ],
        },
        select: {
          id: true,
          title: true,
          company: { select: { id: true, legalName: true, brandName: true } },
          owner: { select: { id: true, fullName: true } },
          stage: { select: { id: true, code: true, label: true } },
          expectedCloseDate: true,
          estimatedValue: true,
          probability: true,
        },
        orderBy: [{ expectedCloseDate: "asc" }, { estimatedValue: "desc" }],
        take: 5,
      }),
      this.prisma.task.findMany({
        where: {
          AND: [
            this.taskWhere(f, user),
            { status: { in: OPEN_TASKS }, dueAt: { lt: clock.now } },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueAt: true,
          assignedTo: { select: { id: true, fullName: true } },
          opportunity: { select: { id: true, title: true } },
          company: { select: { id: true, legalName: true, brandName: true } },
        },
        orderBy: { dueAt: "asc" },
        take: 5,
      }),
      this.prisma.meeting.findMany({
        where: {
          AND: [
            this.meetingWhere(f, user),
            { status: MeetingStatus.SCHEDULED, endAt: { lt: clock.now } },
          ],
        },
        select: {
          id: true,
          title: true,
          startAt: true,
          endAt: true,
          company: { select: { id: true, legalName: true, brandName: true } },
          opportunity: { select: { id: true, title: true } },
          organizer: { select: { id: true, fullName: true } },
        },
        orderBy: { endAt: "asc" },
        take: 5,
      }),
    ]);
    const [todayMeetingCount, upcomingMeetingCount] = await Promise.all([
      this.prisma.meeting.count({
        where: {
          AND: [
            this.meetingWhere(f, user),
            { startAt: { gte: clock.start, lt: clock.end } },
          ],
        },
      }),
      this.prisma.meeting.count({
        where: {
          AND: [
            this.meetingWhere(f, user),
            {
              startAt: {
                gte: clock.end,
                lt: new Date(clock.end.getTime() + 7 * 86_400_000),
              },
            },
          ],
        },
      }),
    ]);
    return {
      generatedAt: clock.now.toISOString(),
      period: {
        startDate: range.gte!.toISOString(),
        endDate: (range.lt ?? range.lte!).toISOString(),
      },
      current: {
        activeOpportunities: {
          count: opportunities.length,
          estimatedValueIrr: this.money(opportunities).toString(),
          weightedValueIrr: this.weighted(opportunities).toString(),
          missingValueCount: opportunities.filter((o) => !o.estimatedValue)
            .length,
          missingProbabilityCount: opportunities.filter(
            (o) => o.probability == null,
          ).length,
        },
        tasks: tasks.current,
        meetings: {
          todayCount: todayMeetingCount,
          upcomingSevenDaysCount: upcomingMeetingCount,
          pastScheduledCount: meetings.summary.pastScheduledCount,
        },
      },
      periodPerformance: {
        opportunities: {
          createdCount: createdOpportunities.length,
          wonCount: wonOpportunities.length,
          lostCount: lostOpportunities.length,
          wonEstimatedValueIrr: this.money(wonOpportunities).toString(),
          winRate: this.percent(
            wonOpportunities.length,
            wonOpportunities.length + lostOpportunities.length,
          ),
        },
        tasks: tasks.periodFlow,
        meetings: {
          totalCount: meetings.summary.totalCount,
          completedCount: meetings.summary.completedCount,
          cancelledCount: meetings.summary.cancelledCount,
          pastScheduledCount: meetings.summary.pastScheduledCount,
          executionRate: meetings.summary.executionRate,
        },
      },
      forecast: {
        horizonStartDate: forecast.period.startDate,
        horizonEndDate: forecast.period.endDate,
        opportunityCount: forecast.summary.forecastOpportunityCount,
        estimatedValueIrr: forecast.summary.estimatedValueIrr,
        weightedValueIrr: forecast.summary.weightedValueIrr,
        overdueCloseCount: forecast.summary.overdueCloseCount,
        withoutCloseDateCount: forecast.summary.withoutCloseDateCount,
      },
      attention: {
        overdueOpportunities,
        overdueTasks,
        pastScheduledMeetings: pastMeetings,
      },
    };
  }

  private inRange(date: Date, range: { gte?: Date; lte?: Date; lt?: Date }) {
    return (
      (!range.gte || date >= range.gte) &&
      (!range.lte || date <= range.lte) &&
      (!range.lt || date < range.lt)
    );
  }
  private days(from: Date, to: Date) {
    return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
  }
  private avg(values: number[]) {
    return values.length
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) /
          100
      : 0;
  }
  private monthBuckets(start: Date, end: Date) {
    const out: Array<{ start: Date; end: Date }> = [];
    let cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    );
    while (cursor < end) {
      const next = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
      );
      out.push({
        start: new Date(Math.max(cursor.getTime(), start.getTime())),
        end: new Date(Math.min(next.getTime(), end.getTime())),
      });
      cursor = next;
    }
    return out;
  }
  private trend<T extends Record<string, unknown>>(
    rows: T[],
    range: { gte?: Date; lte?: Date; lt?: Date } | undefined,
    field: keyof T,
    now: Date,
  ) {
    const start =
        range?.gte ??
        (rows.length
          ? new Date(Math.min(...rows.map((r) => (r[field] as Date).getTime())))
          : now),
      end = range?.lt ?? range?.lte ?? now;
    const dayCount = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / 86_400_000),
    );
    const stepDays = dayCount <= 31 ? 1 : 7;
    const buckets: Array<{ start: Date; end: Date }> = [];
    for (
      let cursor = start;
      cursor < end;
      cursor = new Date(cursor.getTime() + stepDays * 86_400_000)
    ) {
      buckets.push({
        start: cursor,
        end: new Date(
          Math.min(end.getTime(), cursor.getTime() + stepDays * 86_400_000),
        ),
      });
    }
    return buckets.map((p) => {
      const inBucket = (date: unknown) =>
        date instanceof Date && date >= p.start && date < p.end;
      const periodRows = rows.filter((row) => inBucket(row[field]));
      return {
        periodStart: p.start.toISOString(),
        periodEnd: p.end.toISOString(),
        granularity: stepDays === 1 ? "DAY" : "WEEK",
        totalCount: periodRows.length,
        createdCount: rows.filter((row) => inBucket(row.createdAt)).length,
        completedCount: rows.filter(
          (row) =>
            row.status === "COMPLETED" &&
            inBucket(row.completedAt ?? row[field]),
        ).length,
        cancelledCount: rows.filter(
          (row) =>
            row.status === "CANCELLED" &&
            inBucket(row.cancelledAt ?? row[field]),
        ).length,
        pastScheduledCount: periodRows.filter(
          (row) =>
            row.status === "SCHEDULED" &&
            row.endAt instanceof Date &&
            row.endAt < now,
        ).length,
      };
    });
  }
}
