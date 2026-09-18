import { BadRequestException, Injectable } from "@nestjs/common";
import { AuditLogService } from "../audit-log/audit-log.service";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { ReportExportService } from "../common/export/report-export.service";
import { getCurrentOrganizationId } from "../common/tenant/tenant-scope.util";
import { AdvancedReportsService } from "./advanced-reports.service";
import { CommercialReportsService } from "./commercial-reports.service";
import { DataQualityService } from "./data-quality.service";
import { PeriodComparisonService } from "./period-comparison.service";
import { ReportsService } from "./reports.service";
const KEYS = [
  "period-comparison",
  "data-quality",
  "opportunity-aging",
  "opportunity-forecast",
  "meeting-performance",
  "task-performance",
  "financial-collections",
  "product-performance",
  "exchange-rate-impact",
  "pipeline-summary",
  "pipeline-by-owner",
  "activities",
  "activities-by-user",
  "stage-durations",
  "conversion-rates",
] as const;
@Injectable()
export class ReportExportsService {
  constructor(
    private exporter: ReportExportService,
    private audit: AuditLogService,
    private reports: ReportsService,
    private advanced: AdvancedReportsService,
    private commercial: CommercialReportsService,
    private quality: DataQualityService,
    private comparison: PeriodComparisonService,
  ) {}
  async export(key: string, q: any, user: CurrentUserPayload) {
    if (!KEYS.includes(key as any))
      throw new BadRequestException("Invalid reportKey");
    const format = q.format === "xlsx" ? "xlsx" : "csv",
      filters = { ...q, format: undefined };
    const result = await this.run(key, filters, user),
      workbookSheets =
        key === "data-quality"
          ? await this.qualitySheets(result, filters, user)
          : key === "period-comparison"
            ? this.comparisonSheets(result)
            : this.genericSheets(key, result, filters),
      sheets =
        format === "xlsx"
          ? workbookSheets
          : this.csvSheets(key, workbookSheets);
    const file = this.exporter.create(
      format,
      `iam-${key}`,
      sheets,
      format === "csv" ? 50000 : 20000,
    );
    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: "report",
      action: "report.exported",
      metadata: {
        reportKey: key,
        format,
        rowCount: file.rowCount,
        filters: this.safeFilters(filters),
      },
    });
    return file;
  }
  private csvSheets(key: string, sheets: Array<{ name: string; rows: any[] }>) {
    if (key === "data-quality") {
      return [
        {
          name: "Issues",
          rows: sheets
            .filter((sheet) => sheet.name.endsWith("Issues"))
            .flatMap((sheet) => sheet.rows),
        },
      ];
    }
    if (key === "period-comparison")
      return [sheets.find((sheet) => sheet.name === "Metrics")!];
    return [sheets.find((sheet) => sheet.name === "Report") ?? sheets[0]];
  }
  private run(
    key: string,
    q: any,
    user: CurrentUserPayload,
  ): Promise<any> | any {
    switch (key) {
      case "period-comparison":
        return this.comparison.compare(q, user);
      case "data-quality":
        return this.quality.report(q, user);
      case "opportunity-aging":
        return this.advanced.aging(q, user);
      case "opportunity-forecast":
        return this.advanced.forecast(q, user);
      case "meeting-performance":
        return this.advanced.meetingPerformance(q, user);
      case "task-performance":
        return this.advanced.taskPerformance(q, user);
      case "financial-collections":
        return this.commercial.financial(q, user);
      case "product-performance":
        return this.commercial.products(q, user);
      case "exchange-rate-impact":
        return this.commercial.exchangeImpact(q);
      case "pipeline-summary":
        return this.reports.getPipelineSummary(q, user);
      case "pipeline-by-owner":
        return this.reports.getPipelineByOwner(q, user);
      case "activities":
        return this.reports.getActivityReport(q, user);
      case "activities-by-user":
        return this.reports.getActivitiesByUser(q, user);
      case "stage-durations":
        return this.reports.getAverageStageDuration(q, user);
      case "conversion-rates":
        return this.reports.getConversionRates(q, user);
      default:
        throw new BadRequestException("Invalid reportKey");
    }
  }
  private async qualitySheets(r: any, q: any, user: CurrentUserPayload) {
    const issueRows: any[] = [];
    for (const section of [r.organization, r.globalCatalog].filter(Boolean))
      for (const rule of section.rules) {
        const issues = await this.quality.issues(
          { ...q, ruleKey: rule.ruleKey, page: 1, limit: 50000 },
          user,
        );
        issueRows.push(
          ...issues.data.map((x: any) => ({
            scope: x.scope,
            ruleKey: rule.ruleKey,
            severity: rule.severity,
            entityType: x.entityType,
            title: x.title,
            company: x.company?.brandName ?? x.company?.legalName ?? "",
            owner: x.owner?.fullName ?? "",
            fields: x.fieldNames.join(", "),
            message: x.message,
            generatedAt: r.asOf,
          })),
        );
      }
    const summary = (name: string, s: any) => [
      {
        scope: name,
        overallScore: s.score.overall,
        eligibleChecks: s.score.eligibleChecks,
        passedChecks: s.score.passedChecks,
        issueOccurrences: s.score.issueOccurrences,
      },
    ];
    return [
      {
        name: "Organization Summary",
        rows: summary("ORGANIZATION", r.organization),
      },
      { name: "Organization Rules", rows: r.organization.rules },
      {
        name: "Organization Issues",
        rows: issueRows.filter((x) => x.scope === "ORGANIZATION"),
      },
      ...(r.globalCatalog
        ? [
            {
              name: "Global Catalog Summary",
              rows: summary("GLOBAL_CATALOG", r.globalCatalog),
            },
            { name: "Global Catalog Rules", rows: r.globalCatalog.rules },
            {
              name: "Global Catalog Issues",
              rows: issueRows.filter((x) => x.scope === "GLOBAL_CATALOG"),
            },
          ]
        : []),
    ];
  }
  private comparisonSheets(r: any) {
    return [
      {
        name: "Periods",
        rows: [
          {
            currentStart: r.currentPeriod.startDate,
            currentEnd: r.currentPeriod.endDate,
            comparisonStart: r.comparisonPeriod.startDate,
            comparisonEnd: r.comparisonPeriod.endDate,
            mode: r.comparisonPeriod.mode,
          },
        ],
      },
      {
        name: "Metrics",
        rows: r.groups.flatMap((g: any) =>
          g.metrics.map((m: any) => ({ group: g.title, ...m })),
        ),
      },
    ];
  }
  private genericSheets(key: string, r: any, filters: any) {
    const primary = Array.isArray(r)
      ? r
      : Array.isArray(r.data)
        ? r.data
        : Array.isArray(r.rules)
          ? r.rules
          : Array.isArray(r.periods)
            ? r.periods
            : Array.isArray(r.byOwner)
              ? r.byOwner
              : Array.isArray(r.trend)
                ? r.trend
                : [this.flatten(r)];
    return [
      {
        name: "Metadata",
        rows: [
          {
            reportKey: key,
            generatedAt: new Date().toISOString(),
            filters: JSON.stringify(this.safeFilters(filters)),
            period: JSON.stringify(r.period ?? null),
          },
        ],
      },
      { name: "Report", rows: primary },
    ];
  }
  private flatten(value: any, prefix = "", out: Record<string, unknown> = {}) {
    if (value == null || typeof value !== "object") {
      out[prefix] = value;
      return out;
    }
    for (const [k, v] of Object.entries(value))
      if (!Array.isArray(v))
        this.flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  private safeFilters(q: any) {
    return Object.fromEntries(
      Object.entries(q).filter(
        ([k]) => !/(token|secret|password|authorization|cookie)/i.test(k),
      ),
    );
  }
}
