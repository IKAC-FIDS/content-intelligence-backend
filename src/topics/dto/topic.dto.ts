import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export const TOPIC_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export class TopicAliasInputDto {
  @ApiProperty({ maxLength: 200 }) @IsString() @MaxLength(200) value!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID('4') languageId?: string | null;
}
export class CreateTopicDto {
  @ApiProperty({ example: 'zero-trust', maxLength: 100 }) @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s_]+/g, '-') : value) @IsString() @MaxLength(100) @Matches(TOPIC_CODE_PATTERN) code!: string;
  @ApiProperty({ maxLength: 200 }) @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiProperty({ type: [String], format: 'uuid' }) @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) domainIds!: string[];
  @ApiPropertyOptional({ type: [TopicAliasInputDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TopicAliasInputDto) aliases?: TopicAliasInputDto[];
}
export class UpdateTopicDto {
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional({ maxLength: 2000, nullable: true }) @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @ApiPropertyOptional({ type: [String], format: 'uuid' }) @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) domainIds?: string[];
  @ApiPropertyOptional({ type: [TopicAliasInputDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TopicAliasInputDto) aliases?: TopicAliasInputDto[];
}
export class FindTopicsDto extends PaginationDto {
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) search?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') domainId?: string;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() isActive?: boolean;
}
