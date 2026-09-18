import { QuotaResetPeriod } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const NON_NEGATIVE_INTEGER = /^(0|[1-9]\d*)$/;

export class SetPlanQuotaDto {
  @IsBoolean() enabled: boolean;
  @IsBoolean() isUnlimited: boolean;
  @IsOptional() @Matches(NON_NEGATIVE_INTEGER) softLimit?: string | null;
  @IsOptional() @Matches(NON_NEGATIVE_INTEGER) hardLimit?: string | null;
  @IsEnum(QuotaResetPeriod) resetPeriod: QuotaResetPeriod;
}

export class SetOrganizationQuotaOverrideDto {
  @IsOptional() @IsBoolean() enabled?: boolean | null;
  @IsOptional() @IsBoolean() isUnlimited?: boolean | null;
  @IsOptional() @Matches(NON_NEGATIVE_INTEGER) softLimit?: string | null;
  @IsOptional() @Matches(NON_NEGATIVE_INTEGER) hardLimit?: string | null;
  @IsOptional() @IsEnum(QuotaResetPeriod) resetPeriod?: QuotaResetPeriod | null;
  @IsOptional() @IsString() @MaxLength(500) reason?: string | null;
}
