import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ActivitiesService } from "../activities/activities.service";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { AdvancedReportFiltersDto } from "../reports/dto/advanced-report-filters.dto";
import { ReportingScopeService } from "../reports/reporting-scope.service";

interface JalaliDate {
  year: number;
  month: number;
  day: number;
}

interface GregorianDate {
  year: number;
  month: number;
  day: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly activities: ActivitiesService,
    private readonly prisma: PrismaService,
    private readonly scopes: ReportingScopeService,
  ) {}

  latestActivities(user: CurrentUserPayload) {
    return this.activities.latestActivities(user);
  }

  async managementSummary(
    filters: AdvancedReportFiltersDto,
    user: CurrentUserPayload,
  ) {
    const now = new Date();

    /**
     * The management snapshot is deliberately cumulative/current-state.
     * startDate/endDate are not used by ReportingScopeService.opportunity(),
     * while organization/company/owner/team/stage/priority/etc. filters are.
     */
    const portfolioScope: Prisma.OpportunityWhereInput = {
      AND: [
        this.scopes.opportunity(filters, user),
        {
          archivedAt: null,
          company: { archivedAt: null },
        },
      ],
    };

    /**
     * The 12-month opportunity trend is bucketed by real Persian (Jalali)
     * calendar months. Each bucket starts at 00:00 UTC on the Gregorian date
     * corresponding to the first day of the Jalali month.
     */
    const currentJalaliMonth = this.getJalaliDate(now);

    const monthBuckets = Array.from({ length: 12 }, (_, index) => {
      const monthOffset = index - 11;
      const startJalali = this.addJalaliMonths(
        currentJalaliMonth.year,
        currentJalaliMonth.month,
        monthOffset,
      );
      const endJalali = this.addJalaliMonths(
        currentJalaliMonth.year,
        currentJalaliMonth.month,
        monthOffset + 1,
      );

      return {
        start: this.jalaliMonthStartUtc(
          startJalali.year,
          startJalali.month,
        ),
        end: this.jalaliMonthStartUtc(
          endJalali.year,
          endJalali.month,
        ),
      };
    });

    const trendStart = monthBuckets[0].start;

    const [
      portfolioOpportunities,
      createdTrendOpportunities,
      wonTrendOpportunities,
      lostTrendOpportunities,
    ] = await Promise.all([
      this.prisma.opportunity.findMany({
        where: portfolioScope,
        select: {
          estimatedValue: true,
          stage: {
            select: {
              isTerminal: true,
              terminalType: true,
            },
          },
        },
      }),

      this.prisma.opportunity.findMany({
        where: {
          AND: [portfolioScope, { createdAt: { gte: trendStart } }],
        },
        select: {
          createdAt: true,
          estimatedValue: true,
        },
      }),

      this.prisma.opportunity.findMany({
        where: {
          AND: [
            portfolioScope,
            {
              wonAt: { gte: trendStart },
              stage: { terminalType: "WON" },
            },
          ],
        },
        select: {
          wonAt: true,
          estimatedValue: true,
        },
      }),

      this.prisma.opportunity.findMany({
        where: {
          AND: [
            portfolioScope,
            {
              lostAt: { gte: trendStart },
              stage: { terminalType: "LOST" },
            },
          ],
        },
        select: {
          lostAt: true,
          estimatedValue: true,
        },
      }),
    ]);

    const activePortfolio = portfolioOpportunities.filter(
      (opportunity) => !opportunity.stage.isTerminal,
    );

    const wonPortfolio = portfolioOpportunities.filter(
      (opportunity) => opportunity.stage.terminalType === "WON",
    );

    const lostPortfolio = portfolioOpportunities.filter(
      (opportunity) => opportunity.stage.terminalType === "LOST",
    );

    const totalPortfolioCount = portfolioOpportunities.length;

    const inBucket = (
      date: Date | null,
      start: Date,
      end: Date,
    ): boolean => Boolean(date && date >= start && date < end);

    const opportunityTrend12m = monthBuckets.map(({ start, end }) => {
      const createdRows = createdTrendOpportunities.filter((opportunity) =>
        inBucket(opportunity.createdAt, start, end),
      );

      const wonRows = wonTrendOpportunities.filter((opportunity) =>
        inBucket(opportunity.wonAt, start, end),
      );

      const lostRows = lostTrendOpportunities.filter((opportunity) =>
        inBucket(opportunity.lostAt, start, end),
      );

      return {
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),

        createdCount: createdRows.length,
        wonCount: wonRows.length,
        lostCount: lostRows.length,

        createdValueIrr: this.money(createdRows).toString(),
        wonValueIrr: this.money(wonRows).toString(),
        lostValueIrr: this.money(lostRows).toString(),
      };
    });

    return {
      portfolio: {
        total: {
          count: totalPortfolioCount,
          estimatedValueIrr: this.money(portfolioOpportunities).toString(),
        },

        active: {
          count: activePortfolio.length,
          estimatedValueIrr: this.money(activePortfolio).toString(),
          percentage: this.percent(
            activePortfolio.length,
            totalPortfolioCount,
          ),
        },

        won: {
          count: wonPortfolio.length,
          estimatedValueIrr: this.money(wonPortfolio).toString(),
          percentage: this.percent(wonPortfolio.length, totalPortfolioCount),
        },

        lost: {
          count: lostPortfolio.length,
          estimatedValueIrr: this.money(lostPortfolio).toString(),
          percentage: this.percent(lostPortfolio.length, totalPortfolioCount),
        },
      },

      opportunityTrend12m,
    };
  }

  private getJalaliDate(date: Date): JalaliDate {
    const formatter = new Intl.DateTimeFormat(
      "en-US-u-ca-persian-nu-latn",
      {
        timeZone: "UTC",
        year: "numeric",
        month: "numeric",
        day: "numeric",
      },
    );

    const parts = formatter.formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes): number => {
      const part = parts.find((item) => item.type === type)?.value;
      const parsed = Number(part);

      if (!Number.isInteger(parsed)) {
        throw new Error(`Unable to resolve Persian calendar ${type}`);
      }

      return parsed;
    };

    return {
      year: value("year"),
      month: value("month"),
      day: value("day"),
    };
  }

  private addJalaliMonths(
    year: number,
    month: number,
    offset: number,
  ): Pick<JalaliDate, "year" | "month"> {
    const zeroBasedMonth = year * 12 + (month - 1) + offset;
    const targetYear = Math.floor(zeroBasedMonth / 12);
    const targetMonth = ((zeroBasedMonth % 12) + 12) % 12;

    return {
      year: targetYear,
      month: targetMonth + 1,
    };
  }

  private jalaliMonthStartUtc(year: number, month: number): Date {
    const gregorian = this.jalaliToGregorian(year, month, 1);

    return new Date(
      Date.UTC(
        gregorian.year,
        gregorian.month - 1,
        gregorian.day,
        0,
        0,
        0,
        0,
      ),
    );
  }

  /**
   * Converts a Jalali date to Gregorian without adding a runtime dependency.
   * This implementation uses the standard arithmetic 33-year Jalali cycle,
   * which is sufficient for application/reporting dates in the supported era.
   */
  private jalaliToGregorian(
    jalaliYear: number,
    jalaliMonth: number,
    jalaliDay: number,
  ): GregorianDate {
    const jy = jalaliYear + 1595;

    let days =
      -355668 +
      365 * jy +
      Math.floor(jy / 33) * 8 +
      Math.floor(((jy % 33) + 3) / 4) +
      jalaliDay +
      (jalaliMonth < 7
        ? (jalaliMonth - 1) * 31
        : (jalaliMonth - 7) * 30 + 186);

    let year = 400 * Math.floor(days / 146097);
    days %= 146097;

    if (days > 36524) {
      year += 100 * Math.floor(--days / 36524);
      days %= 36524;

      if (days >= 365) {
        days++;
      }
    }

    year += 4 * Math.floor(days / 1461);
    days %= 1461;

    if (days > 365) {
      year += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }

    let day = days + 1;

    const monthLengths = [
      0,
      31,
      this.isGregorianLeapYear(year) ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ];

    let month = 1;

    while (month <= 12 && day > monthLengths[month]) {
      day -= monthLengths[month];
      month++;
    }

    return { year, month, day };
  }

  private isGregorianLeapYear(year: number): boolean {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }

  private money(
    rows: Array<{ estimatedValue: Prisma.Decimal | null }>,
  ): Prisma.Decimal {
    return rows.reduce(
      (sum, row) => sum.plus(row.estimatedValue ?? 0),
      new Prisma.Decimal(0),
    );
  }

  private percent(part: number, total: number): number {
    return total ? Math.round((part / total) * 100) : 0;
  }
}
