// src/companies/dto/find-companies.dto.ts

import {
  IsBooleanString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { LegacyPipelineStage, Priority } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { OwnershipScope } from '../../common/dto/ownership-scope.dto';

export class FindCompaniesDto extends PaginationDto {
  @IsOptional()
  @IsEnum(OwnershipScope)
  ownershipScope?: OwnershipScope;

  @IsOptional()
  @IsEnum(LegacyPipelineStage)
  stage?: LegacyPipelineStage;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsUUID()
  industryId?: string;

  /**
   * Deprecated compatibility filter.
   * Prefer industryId.
   */
  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  /**
   * Deprecated compatibility filter.
   * Prefer sourceId.
   */
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsBooleanString()
  withoutOwner?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsBooleanString()
  includeArchived?: string;

  @IsOptional()
  @IsBooleanString()
  archivedOnly?: string;
}
