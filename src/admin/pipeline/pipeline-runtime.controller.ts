import { Controller, Get, UseGuards } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PipelineConfigService } from './pipeline-config.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pipeline')
export class PipelineRuntimeController {
  constructor(private service: PipelineConfigService) {}

  @Get('stages')
  @Permissions('opportunity:view')
  getActiveStages() {
    return this.service.getStages(true);
  }

  @Get('transitions')
  @Permissions('opportunity:view')
  getTransitions() {
    return this.service.getTransitions();
  }
}
