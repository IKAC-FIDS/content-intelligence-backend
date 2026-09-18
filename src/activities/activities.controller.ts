import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AnyPermission, Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { FindActivitiesDto } from './dto/find-activities.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { CompleteActivityDto } from './dto/complete-activity.dto';
import { RescheduleActivityDto } from './dto/reschedule-activity.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { FindTaskActivitiesDto } from './dto/find-task-activities.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(private activitiesService: ActivitiesService) {}

  @Get('types/options')
  @AnyPermission('activity:view', 'activity:create', 'activity:update')
  findTypes() { return this.activitiesService.findTypes(); }

  @Get()
  @Permissions('activity:view')
  findAll(@Query() query: FindActivitiesDto, @CurrentUser() user: CurrentUserPayload) {
    return this.activitiesService.findAll(query, user);
  }

  @Get('task/:taskId')
  @Permissions('activity:view')
  findByTask(
    @Param('taskId') taskId: string,
    @Query() query: FindTaskActivitiesDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.activitiesService.findByTask(
      taskId,
      query,
      query.includeSubtasks ?? false,
      user,
    );
  }

  @Get('follow-ups/due')
  @Permissions('activity:view')
  findDueFollowUps(@CurrentUser() user: CurrentUserPayload, @Query() pagination: PaginationDto) {
    return this.activitiesService.findDueFollowUps(user, pagination);
  }

  @Post()
  @Permissions('activity:create')
  create(@Body() dto: CreateActivityDto, @CurrentUser() user: CurrentUserPayload) {
    return this.activitiesService.create(dto, user);
  }

  @Patch(':activityId')
  @Permissions('activity:update')
  update(@Param('activityId') activityId: string, @Body() dto: UpdateActivityDto, @CurrentUser() user: CurrentUserPayload) {
    return this.activitiesService.updateActivity(activityId, dto, user);
  }

  @Patch(':activityId/complete')
  @Permissions('follow-up:complete')
  complete(@Param('activityId') activityId: string, @Body() dto: CompleteActivityDto, @CurrentUser() user: CurrentUserPayload) {
    return this.activitiesService.completeActivity(activityId, dto, user);
  }

  @Patch(':activityId/reschedule')
  @Permissions('follow-up:reschedule')
  reschedule(@Param('activityId') activityId: string, @Body() dto: RescheduleActivityDto, @CurrentUser() user: CurrentUserPayload) {
    return this.activitiesService.rescheduleActivity(activityId, dto, user);
  }
}
