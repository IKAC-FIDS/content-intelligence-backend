import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common"
import { CurrentUser, type CurrentUserPayload } from "../../common/decorators/current-user.decorator"
import { Permissions } from "../../common/decorators/permissions.decorator"
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard"
import { PermissionsGuard } from "../../common/guards/permissions.guard"
import { CreateDigestPolicyDto, CreateEscalationPolicyDto, UpdateDigestPolicyDto, UpdateEscalationPolicyDto, UpdateQuietHoursDto } from "../dto/notification-orchestration.dto"
import { NotificationPolicyAdminService } from "./notification-policy-admin.service"

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("notification:manage")
@Controller("admin/notification-policies")
export class NotificationPolicyAdminController {
  constructor(private readonly policies: NotificationPolicyAdminService) {}
  @Get("quiet-hours") quiet(@CurrentUser() user: CurrentUserPayload) { return this.policies.quietHours(user) }
  @Patch("quiet-hours") updateQuiet(@Body() dto: UpdateQuietHoursDto, @CurrentUser() user: CurrentUserPayload) { return this.policies.updateQuietHours(dto, user) }
  @Get("digests") digests(@CurrentUser() user: CurrentUserPayload) { return this.policies.listDigests(user) }
  @Post("digests") createDigest(@Body() dto: CreateDigestPolicyDto, @CurrentUser() user: CurrentUserPayload) { return this.policies.createDigest(dto, user) }
  @Patch("digests/:id") updateDigest(@Param("id") id: string, @Body() dto: UpdateDigestPolicyDto, @CurrentUser() user: CurrentUserPayload) { return this.policies.updateDigest(id, dto, user) }
  @Delete("digests/:id") removeDigest(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) { return this.policies.removeDigest(id, user) }
  @Get("escalations") escalations(@CurrentUser() user: CurrentUserPayload) { return this.policies.listEscalations(user) }
  @Post("escalations") createEscalation(@Body() dto: CreateEscalationPolicyDto, @CurrentUser() user: CurrentUserPayload) { return this.policies.createEscalation(dto, user) }
  @Patch("escalations/:id") updateEscalation(@Param("id") id: string, @Body() dto: UpdateEscalationPolicyDto, @CurrentUser() user: CurrentUserPayload) { return this.policies.updateEscalation(id, dto, user) }
  @Delete("escalations/:id") removeEscalation(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) { return this.policies.removeEscalation(id, user) }
}
