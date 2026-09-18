import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common"
import {
  CurrentUser,
  type CurrentUserPayload,
} from "../common/decorators/current-user.decorator"
import { Permissions } from "../common/decorators/permissions.decorator"
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard"
import { PermissionsGuard } from "../common/guards/permissions.guard"
import {
  CreateNotificationRuleDto,
  UpdateNotificationRuleDto,
} from "./dto/notification-rule.dto"
import { NotificationRulesService } from "./notification-rules.service"

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("notification:manage")
@Controller("admin/notification-rules")
export class NotificationRulesController {
  constructor(private readonly rules: NotificationRulesService) {}

  @Get("catalog")
  catalog() {
    return this.rules.catalog()
  }

  @Get("targets/users")
  userTargets(
    @CurrentUser() user: CurrentUserPayload,
    @Query("search") search?: string,
  ) {
    return this.rules.userTargets(user, search)
  }

  @Get("targets/teams")
  teamTargets(@CurrentUser() user: CurrentUserPayload) {
    return this.rules.teamTargets(user)
  }

  @Get("targets/roles")
  roleTargets(@CurrentUser() user: CurrentUserPayload) {
    return this.rules.roleTargets(user)
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.rules.list(user)
  }

  @Get(":id")
  get(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.rules.get(id, user)
  }

  @Post()
  create(
    @Body() dto: CreateNotificationRuleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.rules.create(dto, user)
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateNotificationRuleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.rules.update(id, dto, user)
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.rules.remove(id, user)
  }
}
