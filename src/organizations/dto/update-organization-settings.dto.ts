import {
  OrganizationCalendarSystem,
  OrganizationDateFormat,
} from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsLocale,
  IsOptional,
  IsString,
  IsTimeZone,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class UpdateOrganizationSettingsDto {
  @IsOptional() @IsTimeZone() timezone?: string;
  @IsOptional() @IsLocale() locale?: string;
  @IsOptional()
  @IsEnum(OrganizationCalendarSystem)
  calendarSystem?: OrganizationCalendarSystem;
  @IsOptional()
  @IsEnum(OrganizationDateFormat)
  dateFormat?: OrganizationDateFormat;
  @IsOptional() @IsInt() @Min(0) @Max(6) firstDayOfWeek?: number;
  @IsOptional() @IsString() @MaxLength(120) emailSenderDisplayName?:
    string | null;
  @IsOptional() @IsBoolean() allowPasswordLogin?: boolean;
  @IsOptional() @IsBoolean() allowPasskeyLogin?: boolean;
}
