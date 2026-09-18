import { ActivityTargetType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

export class CreateActivityDto {
  @IsOptional()
  @IsEnum(ActivityTargetType)
  targetType?: ActivityTargetType;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  type: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  outcome?: string;

  @IsOptional()
  @IsApiDateString()
  occurredAt?: string;

  @IsOptional()
  @IsApiDateString()
  nextActionDate?: string;

  @IsOptional()
  @IsUUID()
  opportunityId?: string;
}
