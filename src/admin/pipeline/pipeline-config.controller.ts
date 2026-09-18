import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CreateStageDto } from './dto/create-stage.dto';
import { CreateTransitionDto } from './dto/create-transition.dto';
import { ReorderStagesDto } from './dto/reorder-stages.dto';
import { UpdateStageConfigDto } from './dto/update-stage-config.dto';
import { UpdateTransitionDto } from './dto/update-transition.dto';
import { PipelineConfigService } from './pipeline-config.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/pipeline')
export class PipelineConfigController {
  constructor(private service: PipelineConfigService) {}

  @Get('stages')
  @Permissions('pipeline:config:view')
  getStages() { return this.service.getStages(); }

  @Post('stages')
  @Permissions('pipeline:config:manage')
  createStage(@Body() dto: CreateStageDto, @CurrentUser() actor: CurrentUserPayload) { return this.service.createStage(dto, actor.userId); }

  @Patch('stages/reorder')
  @Permissions('pipeline:config:manage')
  reorderStages(@Body() dto: ReorderStagesDto, @CurrentUser() actor: CurrentUserPayload) { return this.service.reorderStages(dto, actor.userId); }

  @Get('stages/:id')
  @Permissions('pipeline:config:view')
  getStage(@Param('id') id: string) { return this.service.getStage(id); }

  @Patch('stages/:id')
  @Permissions('pipeline:config:manage')
  updateStage(@Param('id') id: string, @Body() dto: UpdateStageConfigDto, @CurrentUser() actor: CurrentUserPayload) { return this.service.updateStage(id, dto, actor.userId); }

  @Delete('stages/:id')
  @Permissions('pipeline:config:manage')
  deleteStage(@Param('id') id: string, @Query('replacementStageId') replacementStageId: string | undefined, @CurrentUser() actor: CurrentUserPayload) { return this.service.deactivateStage(id, replacementStageId, actor.userId); }

  @Get('transitions')
  @Permissions('pipeline:transition:view')
  getTransitions() { return this.service.getTransitions(); }

  @Post('transitions')
  @Permissions('pipeline:transition:manage')
  createTransition(@Body() dto: CreateTransitionDto, @CurrentUser() actor: CurrentUserPayload) { return this.service.createTransition(dto, actor.userId); }

  @Patch('transitions/:id')
  @Permissions('pipeline:transition:manage')
  updateTransition(@Param('id') id: string, @Body() dto: UpdateTransitionDto, @CurrentUser() actor: CurrentUserPayload) { return this.service.updateTransition(id, dto, actor.userId); }

  @Delete('transitions/:id')
  @Permissions('pipeline:transition:manage')
  deleteTransition(@Param('id') id: string, @CurrentUser() actor: CurrentUserPayload) { return this.service.deleteTransition(id, actor.userId); }
}
