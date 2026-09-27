import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsTimeZone, Matches, MaxLength, ValidateIf } from 'class-validator';
import { WORKSPACE_LANGUAGE_CODE_PATTERN } from './create-workspace.dto';

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({
    maxLength: 35,
    pattern: WORKSPACE_LANGUAGE_CODE_PATTERN.source,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(35)
  @Matches(WORKSPACE_LANGUAGE_CODE_PATTERN)
  defaultLanguageCode?: string | null;

  @ApiPropertyOptional({ example: 'Asia/Tehran' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
