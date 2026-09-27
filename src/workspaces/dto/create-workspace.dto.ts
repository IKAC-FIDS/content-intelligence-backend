import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsTimeZone, Matches, MaxLength } from 'class-validator';

export const WORKSPACE_LANGUAGE_CODE_PATTERN =
  /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?(?:-[A-Za-z0-9]{5,8}|-\d[A-Za-z0-9]{3})*$/;

export class CreateWorkspaceDto {
  @ApiProperty({ maxLength: 160, example: 'Technology Intelligence' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ maxLength: 80, example: 'technology-intelligence' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiPropertyOptional({
    maxLength: 35,
    pattern: WORKSPACE_LANGUAGE_CODE_PATTERN.source,
    example: 'fa-IR',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(35)
  @Matches(WORKSPACE_LANGUAGE_CODE_PATTERN)
  defaultLanguageCode?: string;

  @ApiPropertyOptional({ default: 'Asia/Tehran', example: 'Asia/Tehran' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
