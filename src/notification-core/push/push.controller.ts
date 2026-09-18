import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, UseGuards } from "@nestjs/common"
import { CurrentUser, type CurrentUserPayload } from "../../common/decorators/current-user.decorator"
import { Permissions } from "../../common/decorators/permissions.decorator"
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard"
import { PermissionsGuard } from "../../common/guards/permissions.guard"
import { tenantScope } from "../../common/tenant/tenant-scope.util"
import { RegisterPushSubscriptionDto, TestPushDto, UpdatePushSettingsDto } from "./dto/push.dto"
import { PushSettingsService } from "./push-settings.service"

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("notification:manage")
@Controller("admin/notification-channels/push")
export class PushAdminController {
  constructor(private readonly push: PushSettingsService) {}
  @Get() get(@CurrentUser() user: CurrentUserPayload) { return this.push.get(tenantScope.require(user)) }
  @Patch() update(@Body() dto: UpdatePushSettingsDto, @CurrentUser() user: CurrentUserPayload) { return this.push.update(tenantScope.require(user), dto) }
  @Post("test") test(@Body() dto: TestPushDto, @CurrentUser() user: CurrentUserPayload) { return this.push.test(tenantScope.require(user), dto) }
}

@UseGuards(JwtAuthGuard)
@Controller("notification-push")
export class PushSubscriptionController {
  constructor(private readonly push: PushSettingsService) {}
  @Get("public-config") config(@CurrentUser() user: CurrentUserPayload) { return this.push.publicConfig(tenantScope.require(user)) }
  @Get("subscriptions") list(@CurrentUser() user: CurrentUserPayload) { return this.push.listOwn(tenantScope.require(user)) }
  @Post("subscriptions") register(@Body() dto: RegisterPushSubscriptionDto, @CurrentUser() user: CurrentUserPayload, @Headers("user-agent") userAgent?: string) { return this.push.register(tenantScope.require(user), dto, userAgent) }
  @Delete("subscriptions/:id") remove(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) { return this.push.removeOwn(tenantScope.require(user), id) }
}
