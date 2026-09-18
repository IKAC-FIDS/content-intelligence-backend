import { PartialType } from '@nestjs/mapped-types';
import { PersonEducationDegree } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

const emptyToUndefined = ({ value }: { value: unknown }) => value === '' || value === null || value === undefined ? undefined : value;

export class CreatePersonEmploymentHistoryDto {
  @IsUUID() companyId!: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(2000) description?: string;
}
export class UpdatePersonEmploymentHistoryDto extends PartialType(CreatePersonEmploymentHistoryDto) {}

export class CreatePersonEmploymentPositionDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @Transform(emptyToUndefined) @IsApiDateString() startDate?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsApiDateString() endDate?: string;
  @IsOptional() @IsBoolean() isCurrent?: boolean;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(2000) description?: string;
}
export class UpdatePersonEmploymentPositionDto extends PartialType(CreatePersonEmploymentPositionDto) {}

export class CreatePersonEducationHistoryDto {
  @IsOptional() @Transform(emptyToUndefined) @IsEnum(PersonEducationDegree) degree?: PersonEducationDegree;
  @IsOptional() @Transform(emptyToUndefined) @IsUUID() universityId?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsApiDateString() educationDate?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(2000) description?: string;
}
export class UpdatePersonEducationHistoryDto extends PartialType(CreatePersonEducationHistoryDto) {}
