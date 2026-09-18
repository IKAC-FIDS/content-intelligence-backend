import { Global, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { HttpRequestLoggingMiddleware } from "../common/logging/http-request-logging.middleware";
import { AuditLogController } from "./audit-log.controller";
import { AuditRequestContextMiddleware } from "./audit-request-context.middleware";
import { AuditRequestContextService } from "./audit-request-context.service";
import { AuditLogService } from "./audit-log.service";
import { ReportExportService } from "../common/export/report-export.service";
import { PlatformAuditLogController } from "./platform-audit-log.controller";
import { PlatformAuthorityModule } from "../platform-authority/platform-authority.module";

@Global()
@Module({
  imports: [PlatformAuthorityModule],
  controllers: [AuditLogController, PlatformAuditLogController],
  providers: [
    AuditLogService,
    AuditRequestContextService,
    AuditRequestContextMiddleware,
    HttpRequestLoggingMiddleware,
    ReportExportService,
  ],
  exports: [AuditLogService, AuditRequestContextService, ReportExportService],
})
export class AuditLogModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuditRequestContextMiddleware, HttpRequestLoggingMiddleware)
      .forRoutes("*");
  }
}
