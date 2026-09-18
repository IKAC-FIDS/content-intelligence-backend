import { Prisma, UserRole } from "@prisma/client";
import { ExecutionContext } from "@nestjs/common";
import { CallHandler } from "@nestjs/common/interfaces";
import { from, lastValueFrom } from "rxjs";
import { organizationDayBounds } from "../src/common/dates/timezone-boundary.util";
import { ApiResponseInterceptor } from "../src/common/interceptors/api-response.interceptor";
import { AdvancedReportsService } from "../src/reports/advanced-reports.service";
import { ReportsController } from "../src/reports/reports.controller";
import { ReportingScopeService } from "../src/reports/reporting-scope.service";
import { tenantUser } from "./helpers/tenant-user";

const organizationId = "00000000-0000-4000-8000-000000000001";
const user = tenantUser({
  userId: "user-1",
  email: "admin@example.com",
  role: UserRole.ADMIN,
  organizationId,
});

describe("AdvancedReportsService", () => {
  const activeFixture = [
    {
      id: "opportunity-a",
      title: "A",
      company: { id: "company-1", legalName: "Company", brandName: null },
      owner: null,
      stage: {
        id: "open",
        code: "OPEN",
        label: "Open",
        sortOrder: 1,
        isTerminal: false,
        terminalType: "NONE",
      },
      stageId: "open",
      ownerId: null,
      priority: "MEDIUM",
      estimatedValue: new Prisma.Decimal("750000000"),
      probability: 70,
      expectedCloseDate: new Date("2026-08-01T00:00:00.000Z"),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    },
    {
      id: "opportunity-b",
      title: "B",
      company: { id: "company-1", legalName: "Company", brandName: null },
      owner: null,
      stage: {
        id: "open",
        code: "OPEN",
        label: "Open",
        sortOrder: 1,
        isTerminal: false,
        terminalType: "NONE",
      },
      stageId: "open",
      ownerId: null,
      priority: "MEDIUM",
      estimatedValue: new Prisma.Decimal("1200000000"),
      probability: null,
      expectedCloseDate: null,
      createdAt: new Date("2026-06-02T00:00:00.000Z"),
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    },
    {
      id: "opportunity-c",
      title: "C",
      company: { id: "company-1", legalName: "Company", brandName: null },
      owner: null,
      stage: {
        id: "open",
        code: "OPEN",
        label: "Open",
        sortOrder: 1,
        isTerminal: false,
        terminalType: "NONE",
      },
      stageId: "open",
      ownerId: null,
      priority: "MEDIUM",
      estimatedValue: new Prisma.Decimal("704000000"),
      probability: 100,
      expectedCloseDate: new Date("2026-09-01T00:00:00.000Z"),
      createdAt: new Date("2026-06-03T00:00:00.000Z"),
      updatedAt: new Date("2026-07-03T00:00:00.000Z"),
    },
  ];
  it("uses the organization timezone for calendar-day boundaries", () => {
    const result = organizationDayBounds(
      new Date("2026-07-20T12:00:00.000Z"),
      "Asia/Tehran",
    );

    expect(result.start.toISOString()).toBe("2026-07-19T20:30:00.000Z");
    expect(result.end.toISOString()).toBe("2026-07-20T20:30:00.000Z");
  });

  it("handles daylight-saving calendar days without assuming 24 hours", () => {
    const result = organizationDayBounds(
      new Date("2026-03-08T17:00:00.000Z"),
      "America/New_York",
    );

    expect(result.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(result.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("keeps forecast values decimal-safe and applies active organization scope", async () => {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ timezone: "UTC" }),
      },
      opportunity: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "opp-1",
            estimatedValue: new Prisma.Decimal("9007199254740993.25"),
            probability: 25,
            expectedCloseDate: new Date("2026-08-01T00:00:00.000Z"),
            stageId: "stage-1",
            stage: { code: "OPEN", label: "Open", sortOrder: 1 },
            ownerId: null,
            owner: null,
          },
        ]),
      },
    };
    const service = new AdvancedReportsService(
      prisma as any,
      new ReportingScopeService(),
    );

    const result = await service.forecast(
      { startDate: "2026-07-01", endDate: "2026-08-31", page: 1, limit: 20 },
      user as any,
    );

    expect(result.summary.estimatedValueIrr).toBe("9007199254740993.25");
    expect(result.summary.weightedValueIrr).toBe("2251799813685248.3125");
    expect(prisma.opportunity.findMany.mock.calls[0][0].where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationId }),
        {
          archivedAt: null,
          company: { archivedAt: null },
          stage: { isTerminal: false },
        },
      ]),
    );
  });

  it("preserves the complete aging report through the endpoint response interceptor", async () => {
    const opportunity = {
      id: "opp-aging-1",
      title: "Aging opportunity",
      company: { id: "company-1", legalName: "Company", brandName: null },
      owner: null,
      stage: { id: "stage-1", code: "OPEN", label: "Open", sortOrder: 1 },
      stageId: "stage-1",
      priority: "MEDIUM",
      estimatedValue: new Prisma.Decimal("1000"),
      probability: 50,
      expectedCloseDate: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    };
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ timezone: "UTC" }),
      },
      opportunity: { findMany: jest.fn().mockResolvedValue([opportunity]) },
      opportunityStageHistory: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const advanced = new AdvancedReportsService(
      prisma as any,
      new ReportingScopeService(),
    );
    const controller = new ReportsController(
      {} as any,
      {} as any,
      advanced,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const endpointResult = controller.getOpportunityAging(
      { page: 1, limit: 20 },
      user as any,
    );
    const context = {
      switchToHttp: () => ({
        getResponse: () => ({ getHeader: () => "aging-request" }),
      }),
    } as ExecutionContext;
    const next = { handle: () => from(endpointResult) } as CallHandler;
    const response = (await lastValueFrom(
      new ApiResponseInterceptor().intercept(context, next),
    )) as any;

    expect(response.success).toBe(true);
    expect(response).not.toHaveProperty("meta");
    expect(response.data).toMatchObject({
      summary: { activeOpportunityCount: 1 },
      buckets: expect.any(Array),
      data: [expect.objectContaining({ id: "opp-aging-1" })],
      meta: { total: 1, page: 1, limit: 20 },
    });
    expect(response.data.asOf).toEqual(expect.any(String));
  });

  it("reconciles NONE-stage forecast and aging populations with exact Decimal totals", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-22T12:00:00.000Z"));
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ timezone: "UTC" }),
      },
      opportunity: { findMany: jest.fn().mockResolvedValue(activeFixture) },
      opportunityStageHistory: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AdvancedReportsService(
      prisma as any,
      new ReportingScopeService(),
    );
    const forecast = await service.forecast(
      { page: 1, limit: 20 },
      user as any,
    );
    const aging = await service.aging({ page: 1, limit: 20 }, user as any);
    jest.useRealTimers();

    expect(forecast.summary).toMatchObject({
      totalActiveOpportunities: 3,
      forecastOpportunityCount: 2,
      estimatedValueIrr: "1454000000",
      weightedValueIrr: "1229000000",
      withoutCloseDateCount: 1,
      missingProbabilityCount: 1,
    });
    expect(forecast.period).toMatchObject({
      startDate: "2026-07-22T00:00:00.000Z",
      endDate: "2026-10-20T00:00:00.000Z",
    });
    expect(aging.summary.activeOpportunityCount).toBe(3);
    for (const call of prisma.opportunity.findMany.mock.calls)
      expect(JSON.stringify(call[0].where)).not.toContain("terminalType");
  });

  it("computes dashboard current state independently from period event dates", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-22T12:00:00.000Z"));
    const opportunityFindMany = jest.fn().mockImplementation((args: any) => {
      const serialized = JSON.stringify(args.where);
      if (args.select?.probability && !args.select?.id) return activeFixture;
      if (serialized.includes('"createdAt"')) return [{ id: "created-active" }];
      if (serialized.includes('"wonAt"'))
        return [{ estimatedValue: new Prisma.Decimal("750000000") }];
      if (serialized.includes('"lostAt"'))
        return [{ id: "lost-before-created" }];
      return [];
    });
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ timezone: "UTC" }),
      },
      opportunity: { findMany: opportunityFindMany },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      meeting: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new AdvancedReportsService(
      prisma as any,
      new ReportingScopeService(),
    );
    jest.spyOn(service, "forecast").mockResolvedValue({
      period: { startDate: "start", endDate: "end" },
      summary: {
        forecastOpportunityCount: 2,
        estimatedValueIrr: "1454000000",
        weightedValueIrr: "1229000000",
        overdueCloseCount: 0,
        withoutCloseDateCount: 1,
      },
    } as any);
    jest
      .spyOn(service, "taskPerformance")
      .mockResolvedValue({ current: {}, periodFlow: {} } as any);
    jest
      .spyOn(service, "meetingPerformance")
      .mockResolvedValue({
        summary: {
          pastScheduledCount: 0,
          totalCount: 0,
          completedCount: 0,
          cancelledCount: 0,
          executionRate: 0,
        },
      } as any);

    const result = await service.dashboard(
      { page: 1, limit: 20, ownerIds: ["owner-1"], teams: ["team-1"] } as any,
      user as any,
    );
    jest.useRealTimers();

    expect(result.current.activeOpportunities).toEqual({
      count: 3,
      estimatedValueIrr: "2654000000",
      weightedValueIrr: "1229000000",
      missingValueCount: 0,
      missingProbabilityCount: 1,
    });
    expect(result.periodPerformance.opportunities).toEqual({
      createdCount: 1,
      wonCount: 1,
      lostCount: 1,
      wonEstimatedValueIrr: "750000000",
      winRate: 50,
    });
    const eventCalls = opportunityFindMany.mock.calls.slice(1, 4);
    expect(
      eventCalls.every(([args]) =>
        JSON.stringify(args.where).includes("owner-1"),
      ),
    ).toBe(true);
    expect(
      eventCalls.every(([args]) =>
        JSON.stringify(args.where).includes("team-1"),
      ),
    ).toBe(true);
  });
});
