import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export const INTELLIGENCE_DOMAIN_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateIntelligenceDomainDto {
  @ApiProperty({ example: 'healthcare', maxLength: 80 }) @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s_]+/g, '-') : value) @IsString() @MaxLength(80) @Matches(INTELLIGENCE_DOMAIN_CODE_PATTERN) code!: string;
  @ApiProperty({ example: 'Healthcare', maxLength: 160 }) @IsString() @MaxLength(160) name!: string;
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

export class UpdateIntelligenceDomainDto {
  @ApiPropertyOptional({ maxLength: 160 }) @IsOptional() @IsString() @MaxLength(160) name?: string;
  @ApiPropertyOptional({ maxLength: 1000, nullable: true }) @IsOptional() @IsString() @MaxLength(1000) description?: string | null;
}

export class FindIntelligenceDomainsDto extends PaginationDto {
  @ApiPropertyOptional({ maxLength: 160 }) @IsOptional() @IsString() @MaxLength(160) search?: string;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() isActive?: boolean;
}
