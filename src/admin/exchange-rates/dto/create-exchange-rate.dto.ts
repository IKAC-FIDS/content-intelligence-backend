import { Transform } from 'class-transformer';
import { IsDecimal, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsApiDateString } from '../../../common/validators/api-date-string.validator';
const decimalString = ({ value }: { value: unknown }) => value == null ? value : String(value);
export class CreateExchangeRateDto {
  @Transform(decimalString) @IsDecimal({ decimal_digits: '0,6', force_decimal: false }) rate!: string;
  @IsOptional() @IsApiDateString() effectiveFrom?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
