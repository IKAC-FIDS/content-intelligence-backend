import { IsEnum } from 'class-validator';
import { LegacyPipelineStage } from '@prisma/client';

export class ChangeStageDto {
  @IsEnum(LegacyPipelineStage)
  stage: LegacyPipelineStage;
}
