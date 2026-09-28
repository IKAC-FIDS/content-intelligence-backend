import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsOptional, IsString, IsTimeZone, IsUUID, MaxLength } from 'class-validator';

export class CreateWorkspaceDto {
  @ApiProperty({ maxLength: 160, example: 'Technology Intelligence' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ maxLength: 80, example: 'technology-intelligence' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' }) @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) inputLanguageIds?: string[];
  @ApiPropertyOptional({ type: [String], format: 'uuid' }) @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) outputLanguageIds?: string[];
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID('4') defaultLanguageId?: string;

  @ApiPropertyOptional({ default: 'Asia/Tehran', example: 'Asia/Tehran' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
