import { Module } from "@nestjs/common";
import { ReportsService } from "./reports.service";
import { ConversionHealthService } from "./conversion-health.service";
import { ReportsController } from "./reports.controller";
import { AdvancedReportsService } from "./advanced-reports.service";
import { CommercialReportsService } from "./commercial-reports.service";
import { DataQualityService } from "./data-quality.service";
import { PeriodComparisonService } from "./period-comparison.service";
import { ReportingScopeService } from "./reporting-scope.service";
import { ReportExportsService } from "./report-exports.service";

@Module({
  providers: [
    ReportsService,
    ConversionHealthService,
    AdvancedReportsService,
    CommercialReportsService,
    ReportingScopeService,
    DataQualityService,
    PeriodComparisonService,
    ReportExportsService,
  ],
  controllers: [ReportsController],
  exports: [
    AdvancedReportsService,
    CommercialReportsService,
    DataQualityService,
    PeriodComparisonService,
    ReportingScopeService,
  ],
})
export class ReportsModule {}
