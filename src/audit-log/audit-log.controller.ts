import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiProduces } from "@nestjs/swagger";
import {
  CurrentUser,
  CurrentUserPayload,
} from "../common/decorators/current-user.decorator";
import { Permissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { AuditLogService } from "./audit-log.service";
import { FindAuditLogsDto } from "./dto/find-audit-logs.dto";

@Controller("admin/audit-logs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("audit-log:view")
export class AuditLogController {
  constructor(private service: AuditLogService) {}

  @Get()
  findAll(
    @Query() query: FindAuditLogsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get("summary")
  summary(
    @Query() query: FindAuditLogsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.summary(query, user);
  }

  @Get("filter-options")
  filterOptions(
    @Query() query: FindAuditLogsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.filterOptions(query, user);
  }

  @Get("export")
  @ApiProduces("text/csv", "application/json", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  async export(
    @Query() query: FindAuditLogsDto,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.export(query, user);
    response.setHeader("Content-Type", file.contentType);
    response.setHeader("Content-Disposition", file.contentDisposition);
    return new StreamableFile(file.buffer);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user);
  }
}
