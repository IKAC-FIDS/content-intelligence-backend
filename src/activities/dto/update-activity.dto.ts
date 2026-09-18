import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

const emptyStringToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  type?: string;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsUUID()
  personId?: string | null;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsApiDateString()
  occurredAt?: string | null;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  notes?: string | null;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  outcome?: string | null;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsApiDateString()
  nextActionDate?: string | null;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsUUID()
  opportunityId?: string | null;
}
