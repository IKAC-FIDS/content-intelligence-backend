import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class RescheduleActivityDto {
  @IsString()
  @IsNotEmpty()
  @IsApiDateString()
  nextActionDate!: string;

  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  note?: string;
}
