import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

export class FindCompanyOptionsDto {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 25;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  excludeId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  selectedId?: string;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  includeArchived?: boolean = false;
}
