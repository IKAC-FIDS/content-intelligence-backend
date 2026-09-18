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
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AnyPermission, Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { FindTeamsDto } from './dto/find-teams.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TeamsController {
  constructor(private readonly service: TeamsService) {}

  @Get()
  @AnyPermission('team:view', 'technical-tender:manage', 'technical-tender:review-technical', 'technical-tender:review-commercial')
  findAll(@Query() query: FindTeamsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findAll(query, user);
  }

  @Post()
  @Permissions('team:manage')
  create(@Body() dto: CreateTeamDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Get(':id')
  @Permissions('team:view')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('team:manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/activate')
  @Permissions('team:manage')
  activate(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.activate(id, user);
  }

  @Patch(':id/deactivate')
  @Permissions('team:manage')
  deactivate(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deactivate(id, user);
  }

  @Get(':id/members')
  @Permissions('team:view')
  members(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.members(id, user);
  }

  @Post(':id/members')
  @Permissions('team:manage')
  addMember(
    @Param('id') id: string,
    @Body() dto: AddTeamMemberDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.addMember(id, dto, user);
  }

  @Delete(':id/members/:userId')
  @Permissions('team:manage')
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.removeMember(id, userId, user);
  }
}
