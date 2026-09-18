import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common"
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator"
import { Permissions } from "../common/decorators/permissions.decorator"
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard"
import { PermissionsGuard } from "../common/guards/permissions.guard"
import { tenantScope } from "../common/tenant/tenant-scope.util"
import { CreateNotificationTemplateDto, NotificationDeliveryQueryDto, NotificationTemplateQueryDto, PreviewNotificationTemplateDto, UpdateNotificationTemplateDto } from "./dto/notification-admin.dto"
import { NotificationAdminService } from "./notification-admin.service"
import { NotificationDeliveryQueueService } from "./queue/notification-delivery-queue.service"

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("notification:manage")
@Controller("admin/notifications")
export class NotificationAdminController {
  constructor(private readonly admin: NotificationAdminService) {}
  @Get("catalog") catalog() { return this.admin.catalog() }
  @Get("templates") templates(@Query() query: NotificationTemplateQueryDto, @CurrentUser() user: CurrentUserPayload) { return this.admin.listTemplates(query, user) }
  @Get("templates/variables") variables(@Query("eventName") eventName: string) { return this.admin.templateVariables(eventName) }
  @Post("templates/preview") preview(@Body() dto: PreviewNotificationTemplateDto) { return this.admin.previewTemplate(dto) }
  @Post("templates/:id/activate") activate(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) { return this.admin.activateTemplate(id, user) }
  @Get("templates/:id") template(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) { return this.admin.getTemplate(id, user) }
  @Post("templates") createTemplate(@Body() dto: CreateNotificationTemplateDto, @CurrentUser() user: CurrentUserPayload) { return this.admin.createTemplate(dto, user) }
  @Patch("templates/:id") updateTemplate(@Param("id") id: string, @Body() dto: UpdateNotificationTemplateDto, @CurrentUser() user: CurrentUserPayload) { return this.admin.updateTemplate(id, dto, user) }
  @Delete("templates/:id") removeTemplate(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) { return this.admin.removeTemplate(id, user) }
  @Get("deliveries") @Permissions("notification:view") deliveries(@Query() query: NotificationDeliveryQueryDto, @CurrentUser() user: CurrentUserPayload) { return this.admin.listDeliveries(query, user) }
  @Get("deliveries/:id") @Permissions("notification:view") delivery(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) { return this.admin.getDelivery(id, user) }
  @Get("channels/status") channels(@CurrentUser() user: CurrentUserPayload) { return this.admin.channelStatus(user) }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("notification:manage")
@Controller("admin/notification-templates")
export class NotificationTemplatesController {
  constructor(private readonly admin: NotificationAdminService) {}
  @Get() list(@Query() query: NotificationTemplateQueryDto, @CurrentUser() user: CurrentUserPayload) { return this.admin.listTemplates(query, user) }
  @Get("variables") variables(@Query("eventName") eventName: string) { return this.admin.templateVariables(eventName) }
  @Post("preview") preview(@Body() dto: PreviewNotificationTemplateDto) { return this.admin.previewTemplate(dto) }
  @Post(":id/activate") activate(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) { return this.admin.activateTemplate(id, user) }
  @Get(":id") get(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) { return this.admin.getTemplate(id, user) }
  @Post() create(@Body() dto: CreateNotificationTemplateDto, @CurrentUser() user: CurrentUserPayload) { return this.admin.createTemplate(dto, user) }
  @Patch(":id") update(@Param("id") id: string, @Body() dto: UpdateNotificationTemplateDto, @CurrentUser() user: CurrentUserPayload) { return this.admin.updateTemplate(id, dto, user) }
  @Delete(":id") remove(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) { return this.admin.removeTemplate(id, user) }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("admin/notification-deliveries")
export class NotificationDeliveriesController {
  constructor(private readonly admin: NotificationAdminService, private readonly queue: NotificationDeliveryQueueService) {}
  @Get() @Permissions("notification:view") list(@Query() query: NotificationDeliveryQueryDto, @CurrentUser() user: CurrentUserPayload) { return this.admin.listDeliveries(query, user) }
  @Get(":id") @Permissions("notification:view") get(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) { return this.admin.getDelivery(id, user) }
  @Post(":id/dispatch") @Permissions("notification:manage") dispatch(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) { return this.queue.retryNow(id, tenantScope.require(user).organizationId, user.userId) }
  @Post(":id/retry") @Permissions("notification:manage") retry(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) { return this.queue.retryNow(id, tenantScope.require(user).organizationId, user.userId) }
}
