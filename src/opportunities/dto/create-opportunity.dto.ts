import { Type } from 'class-transformer';
import { Priority } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

export class CreateOpportunityDto {
  @IsUUID()
  companyId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional() @IsUUID() stageId?: string;
  @IsOptional() @IsString() stage?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedValue?: number;

  @IsOptional()
  @IsApiDateString()
  expectedCloseDate?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sourceOptionId?: string;

  @IsOptional()
  @IsString()
  opportunitySource?: string;

  @IsOptional()
  @IsUUID()
  primaryContactId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  @IsOptional()
  @IsString()
  competitor?: string;
}
