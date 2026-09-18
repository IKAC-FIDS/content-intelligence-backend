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
import { AnyPermission, Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AssignTaskDto } from './dto/assign-task.dto';
import { ChangeTaskStatusDto } from './dto/change-task-status.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { FindTasksDto } from './dto/find-tasks.dto';
import { RescheduleTaskDto } from './dto/reschedule-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ReassignTaskDto } from './dto/reassign-task.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { FindTaskEntityOptionsDto, FindTaskOptionsDto } from './dto/find-task-options.dto';
import { TasksService } from './tasks.service';
import { SubmitTaskReviewDto, TaskReviewDecisionDto } from './dto/task-review.dto';

@Controller('tasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  @Permissions('task:view')
  findAll(
    @Query() query: FindTasksDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Post()
  @Permissions('task:create')
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Get('options/teams')
  @AnyPermission('task:create', 'task:update', 'task:assign', 'task:reassign', 'task:create-subtask')
  teamOptions(@Query() query: FindTaskOptionsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findTeamOptions(query, user);
  }

  @Get('options/entities')
  @AnyPermission('task:create', 'task:update', 'task:create-subtask')
  entityOptions(@Query() query: FindTaskEntityOptionsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findEntityOptions(query, user);
  }

  @Get(':id')
  @Permissions('task:view')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('task:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/status')
  @Permissions('task:update')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeTaskStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.changeStatus(id, dto, user);
  }

  @Patch(':id/assign')
  @Permissions('task:assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignTaskDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.assign(id, dto, user);
  }

  @Post(':id/reassign')
  @AnyPermission('task:reassign', 'task:assign')
  reassign(
    @Param('id') id: string,
    @Body() dto: ReassignTaskDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.reassign(id, dto, user);
  }

  @Get(':id/subtasks')
  @Permissions('task:view')
  subtasks(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findSubtasks(id, user);
  }

  @Get(':id/reviews')
  @AnyPermission('task:view', 'task:review')
  reviews(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findReviews(id, user);
  }

  @Post(':id/submit-review')
  @Permissions('task:submit-review')
  submitReview(@Param('id') id: string, @Body() dto: SubmitTaskReviewDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.submitReview(id, dto, user);
  }

  @Post(':id/review/approve')
  @Permissions('task:review')
  approveReview(@Param('id') id: string, @Body() dto: TaskReviewDecisionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.decideReview(id, 'APPROVED', dto, user);
  }

  @Post(':id/review/request-changes')
  @Permissions('task:review')
  requestReviewChanges(@Param('id') id: string, @Body() dto: TaskReviewDecisionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.decideReview(id, 'CHANGES_REQUESTED', dto, user);
  }

  @Post(':id/subtasks')
  @AnyPermission('task:create-subtask', 'task:create')
  createSubtask(
    @Param('id') id: string,
    @Body() dto: CreateSubtaskDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createSubtask(id, dto, user);
  }

  @Patch(':id/complete')
  @Permissions('task:complete')
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteTaskDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.complete(id, dto, user);
  }

  @Patch(':id/reschedule')
  @Permissions('task:update')
  reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleTaskDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.reschedule(id, dto, user);
  }

  @Delete(':id')
  @Permissions('task:delete')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user);
  }
}
