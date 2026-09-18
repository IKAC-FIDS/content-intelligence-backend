import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ChangeOpportunityStageDto {
  @IsOptional() @IsUUID() stageId?: string;
  @IsOptional() @IsString() stage?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
