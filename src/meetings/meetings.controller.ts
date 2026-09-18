import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CancelMeetingDto } from './dto/cancel-meeting.dto';
import { CompleteMeetingDto } from './dto/complete-meeting.dto';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { FindMeetingsDto } from './dto/find-meetings.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { MeetingsService } from './meetings.service';

@Controller('meetings') @UseGuards(JwtAuthGuard, PermissionsGuard)
export class MeetingsController {
  constructor(private readonly service: MeetingsService) {}
  @Post() @Permissions('meeting:create') create(@Body() dto: CreateMeetingDto, @CurrentUser() user: CurrentUserPayload) { return this.service.create(dto, user); }
  @Get() @Permissions('meeting:view') findAll(@Query() query: FindMeetingsDto, @CurrentUser() user: CurrentUserPayload) { return this.service.findAll(query, user); }
  @Get('types/options') @Permissions('meeting:view') findTypes() { return this.service.findTypes(); }
  @Get(':id') @Permissions('meeting:view') findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) { return this.service.findOne(id, user); }
  @Patch(':id') @Permissions('meeting:update') update(@Param('id') id: string, @Body() dto: UpdateMeetingDto, @CurrentUser() user: CurrentUserPayload) { return this.service.update(id, dto, user); }
  @Patch(':id/complete') @Permissions('meeting:complete') complete(@Param('id') id: string, @Body() dto: CompleteMeetingDto, @CurrentUser() user: CurrentUserPayload) { return this.service.complete(id, dto, user); }
  @Patch(':id/cancel') @Permissions('meeting:cancel') cancel(@Param('id') id: string, @Body() dto: CancelMeetingDto, @CurrentUser() user: CurrentUserPayload) { return this.service.cancel(id, dto, user); }
  @Post(':id/notify-assignees') @Permissions('meeting:update') notifyAssignees(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) { return this.service.notifyAssignees(id, user); }
}
