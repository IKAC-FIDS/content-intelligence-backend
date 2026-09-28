import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LanguageDirection } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export const LANGUAGE_CODE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?(?:-[A-Za-z0-9]{5,8}|-\d[A-Za-z0-9]{3})*$/;

export class CreateLanguageDto {
  @ApiProperty({ example: 'de', maxLength: 35 }) @IsString() @MaxLength(35) @Matches(LANGUAGE_CODE_PATTERN) code!: string;
  @ApiProperty({ example: 'German', maxLength: 120 }) @IsString() @MaxLength(120) name!: string;
  @ApiProperty({ example: 'Deutsch', maxLength: 120 }) @IsString() @MaxLength(120) nativeName!: string;
  @ApiProperty({ enum: LanguageDirection }) @IsEnum(LanguageDirection) direction!: LanguageDirection;
}

export class UpdateLanguageDto {
  @ApiPropertyOptional({ maxLength: 120 }) @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional({ maxLength: 120 }) @IsOptional() @IsString() @MaxLength(120) nativeName?: string;
  @ApiPropertyOptional({ enum: LanguageDirection }) @IsOptional() @IsEnum(LanguageDirection) direction?: LanguageDirection;
}

export class FindLanguagesDto extends PaginationDto {
  @ApiPropertyOptional({ maxLength: 160 }) @IsOptional() @IsString() @MaxLength(160) search?: string;
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() isActive?: boolean;
}
