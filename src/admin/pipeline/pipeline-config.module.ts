import { Module } from '@nestjs/common';
import { PipelineConfigController } from './pipeline-config.controller';
import { PipelineRuntimeController } from './pipeline-runtime.controller';
import { PipelineConfigService } from './pipeline-config.service';

@Module({
  controllers: [PipelineConfigController, PipelineRuntimeController],
  providers: [PipelineConfigService],
  exports: [PipelineConfigService],
})
export class PipelineConfigModule {}
