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
} from '@nestjs/common';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { FindNotificationsDto } from './dto/find-notifications.dto';
import { ReadAllNotificationsDto } from './dto/read-all-notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @Permissions('notification:view')
  findAll(
    @Query() query: FindNotificationsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get('unread-count')
  @Permissions('notification:view')
  unreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.service.unreadCount(user);
  }

  @Post()
  @Permissions('notification:send')
  create(
    @Body() dto: CreateNotificationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(dto, user);
  }

  @Patch('read-all')
  @Permissions('notification:manage')
  readAll(
    @Body() dto: ReadAllNotificationsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.readAll(dto, user);
  }

  @Get(':id')
  @Permissions('notification:view')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user);
  }

  @Patch(':id/read')
  @Permissions('notification:manage')
  markRead(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.markRead(id, user);
  }

  @Patch(':id/unread')
  @Permissions('notification:manage')
  markUnread(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.markUnread(id, user);
  }

  @Patch(':id/archive')
  @Permissions('notification:manage')
  archive(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.archive(id, user);
  }

  @Patch(':id/unarchive')
  @Permissions('notification:manage')
  unarchive(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.unarchive(id, user);
  }

  @Delete(':id')
  @Permissions('notification:manage')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user);
  }
}