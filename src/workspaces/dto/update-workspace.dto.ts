import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsOptional, IsString, IsTimeZone, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' }) @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) inputLanguageIds?: string[];
  @ApiPropertyOptional({ type: [String], format: 'uuid' }) @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) outputLanguageIds?: string[];
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @ValidateIf((_object, value) => value !== null) @IsUUID('4') defaultLanguageId?: string | null;
  @ApiPropertyOptional({ type: [String], format: 'uuid' }) @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) domainIds?: string[];
  @ApiPropertyOptional({ type: [String], format: 'uuid' }) @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) topicIds?: string[];

  @ApiPropertyOptional({ example: 'Asia/Tehran' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
