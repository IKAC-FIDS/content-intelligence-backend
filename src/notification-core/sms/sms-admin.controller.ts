import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common"
import { CurrentUser, type CurrentUserPayload } from "../../common/decorators/current-user.decorator"
import { Permissions } from "../../common/decorators/permissions.decorator"
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard"
import { PermissionsGuard } from "../../common/guards/permissions.guard"
import { tenantScope } from "../../common/tenant/tenant-scope.util"
import { TestSmsDto, UpdateSmsSettingsDto } from "./dto/sms-settings.dto"
import { SmsSettingsService } from "./sms-settings.service"

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("notification:manage")
@Controller("admin/notification-channels/sms")
export class SmsAdminController {
  constructor(private readonly settings: SmsSettingsService) {}
  @Get() get(@CurrentUser() user: CurrentUserPayload) { return this.settings.get(tenantScope.require(user).organizationId) }
  @Patch() update(@Body() dto: UpdateSmsSettingsDto, @CurrentUser() user: CurrentUserPayload) { const { organizationId } = tenantScope.require(user); return this.settings.update(organizationId, user.userId, dto) }
  @Post("test") test(@Body() dto: TestSmsDto, @CurrentUser() user: CurrentUserPayload) { const { organizationId } = tenantScope.require(user); return this.settings.test(organizationId, user.userId, dto) }
}
