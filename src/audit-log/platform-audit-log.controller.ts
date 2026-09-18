import { Controller, Get, Param, Query, Res, StreamableFile, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ApiProduces } from "@nestjs/swagger";
import { CurrentPlatform } from "../common/decorators/current-platform.decorator";
import type { PlatformScopeContext } from "../common/tenant/tenant-context.types";
import { PlatformAdminGuard } from "../platform-authority/platform-admin.guard";
import { AuditLogService } from "./audit-log.service";
import { FindAuditLogsDto } from "./dto/find-audit-logs.dto";

@Controller("admin/platform-audit-logs")
@UseGuards(PlatformAdminGuard)
export class PlatformAuditLogController {
  constructor(private readonly service: AuditLogService) {}

  @Get()
  findAll(@Query() query: FindAuditLogsDto) {
    return this.service.findAllPlatform(query);
  }

  @Get("export")
  @ApiProduces("text/csv", "application/json", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  async export(
    @Query() query: FindAuditLogsDto,
    @CurrentPlatform() platform: PlatformScopeContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.exportPlatform(query, platform);
    response.setHeader("Content-Type", file.contentType);
    response.setHeader("Content-Disposition", file.contentDisposition);
    return new StreamableFile(file.buffer);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOnePlatform(id);
  }
}
