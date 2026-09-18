import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import type { Response } from "express";
import {
  CurrentUser,
  CurrentUserPayload,
} from "../common/decorators/current-user.decorator";
import { Permissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { ReportFiltersDto } from "./dto/report-filters.dto";
import { AdvancedReportFiltersDto } from "./dto/advanced-report-filters.dto";
import { AdvancedReportsService } from "./advanced-reports.service";
import { ReportsService } from "./reports.service";
import { ConversionHealthService } from "./conversion-health.service";
import { CommercialReportsService } from "./commercial-reports.service";
import { DataQualityService } from "./data-quality.service";
import {
  DataQualityIssuesQueryDto,
  DataQualityQueryDto,
} from "./dto/data-quality.dto";
import { PeriodComparisonDto } from "./dto/period-comparison.dto";
import { PeriodComparisonService } from "./period-comparison.service";
import { ReportExportsService } from "./report-exports.service";
import { canViewFinancials } from "../common/financial/financial-visibility";

const FINANCIAL_EXPORTS = new Set([
  "period-comparison",
  "opportunity-forecast",
  "financial-collections",
  "product-performance",
  "exchange-rate-impact",
  "pipeline-summary",
  "pipeline-by-owner",
]);

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("report:view")
@Controller("reports")
export class ReportsController {
  constructor(
    private reportsService: ReportsService,
    private conversionHealthService: ConversionHealthService,
    private advancedReportsService: AdvancedReportsService,
    private commercialReportsService: CommercialReportsService,
    private dataQualityService: DataQualityService,
    private periodComparisonService: PeriodComparisonService,
    private reportExports: ReportExportsService,
  ) {}

  @Get("data-quality/issues")
  getDataQualityIssues(
    @Query() query: DataQualityIssuesQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dataQualityService.issues(query, user);
  }

  @Get("data-quality")
  getDataQuality(
    @Query() query: DataQualityQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dataQualityService.report(query, user);
  }

  @Get("period-comparison")
  getPeriodComparison(
    @Query() query: PeriodComparisonDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.periodComparisonService.compare(query, user);
  }

  @Get("exports/:reportKey")
  async exportReport(
    @Param("reportKey") reportKey: string,
    @Query() query: any,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (FINANCIAL_EXPORTS.has(reportKey) && !canViewFinancials(user)) {
      throw new ForbiddenException("Missing permission: financial:view");
    }
    const file = await this.reportExports.export(reportKey, query, user);
    response.setHeader("Content-Type", file.contentType);
    response.setHeader("Content-Disposition", file.contentDisposition);
    return new StreamableFile(file.buffer);
  }

  @Get("financial/collections")
  @Permissions("report:view", "financial:view")
  getFinancialCollections(
    @Query() filters: AdvancedReportFiltersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.commercialReportsService.financial(filters, user);
  }

  @Get("products/performance")
  getProductPerformance(
    @Query() filters: AdvancedReportFiltersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.commercialReportsService.products(filters, user);
  }

  @Get("exchange-rates/impact")
  @Permissions("report:view", "financial:view")
  getExchangeRateImpact(@Query() filters: AdvancedReportFiltersDto) {
    return this.commercialReportsService.exchangeImpact(filters);
  }

  @Get("opportunities/forecast")
  getOpportunityForecast(
    @Query() filters: AdvancedReportFiltersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.advancedReportsService.forecast(filters, user);
  }

  @Get("opportunities/aging")
  getOpportunityAging(
    @Query() filters: AdvancedReportFiltersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.advancedReportsService.aging(filters, user);
  }

  @Get("meetings/performance")
  getMeetingPerformance(
    @Query() filters: AdvancedReportFiltersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.advancedReportsService.meetingPerformance(filters, user);
  }

  @Get("tasks/performance")
  getTaskPerformance(
    @Query() filters: AdvancedReportFiltersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.advancedReportsService.taskPerformance(filters, user);
  }

  @Get("conversion-health")
  getConversionHealth(
    @Query() filters: ReportFiltersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.conversionHealthService.report(filters, user);
  }
  @Get("conversion-rates")
  getConversionRates(
    @Query() filters: ReportFiltersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.reportsService.getConversionRates(filters, user);
  }

  @Get("stage-durations")
  getAverageStageDuration(
    @Query() filters: ReportFiltersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.reportsService.getAverageStageDuration(filters, user);
  }

  @Get("pipeline-summary")
  getPipelineSummary(
    @Query() filters: ReportFiltersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.reportsService.getPipelineSummary(filters, user);
  }

  @Get("activities/by-user")
  getActivitiesByUser(
    @Query() filters: ReportFiltersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.reportsService.getActivitiesByUser(filters, user);
  }

  @Get("activities")
  getActivityReport(
    @Query() filters: ReportFiltersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.reportsService.getActivityReport(filters, user);
  }

  @Get("user-performance")
  getUserPerformance(
    @Query() filters: ReportFiltersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.reportsService.getUserPerformance(filters, user);
  }

  @Get("pipeline/by-owner")
  getPipelineByOwner(
    @Query() filters: ReportFiltersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.reportsService.getPipelineByOwner(filters, user);
  }

  @Get("filter-options")
  getFilterOptions(@CurrentUser() user: CurrentUserPayload) {
    return this.reportsService.getFilterOptions(user);
  }
}

