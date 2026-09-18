import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';
import { CompanyActivityStatus, CompanyOwnership, Priority } from '@prisma/client';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';
import {
  COMPANY_PHONE_PATTERN,
  transformCompanyPhone,
} from '../company-phone.util';

const normalizeDigits = (value: unknown) =>
  typeof value === 'string'
    ? value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim()
    : value;
const optionalInteger = ({ value }: { value: unknown }) => value === '' || value == null ? undefined : Number(normalizeDigits(value));
const optionalText = ({ value }: { value: unknown }) => value === '' || value == null ? undefined : normalizeDigits(value);

export class CreateCompanyDto {
  @IsString()
  legalName: string;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsOptional()
  @IsUUID()
  industryId?: string;

  /**
   * Deprecated compatibility input.
   * Prefer industryId.
   * If sent, it must match an existing Industry.name.
   */
  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsEnum(CompanyOwnership)
  ownership?: CompanyOwnership;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  headOfficeCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  headOfficeAddress?: string | null;

  @IsOptional()
  @Transform(transformCompanyPhone)
  @IsString()
  @Matches(COMPANY_PHONE_PATTERN, {
    message: 'شماره تلفن مرکزی باید شامل ۵ تا ۲۰ رقم و حداکثر یک علامت + در ابتدا باشد',
  })
  centralPhone?: string | null;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  /**
   * Deprecated compatibility input.
   * Prefer sourceId.
   * If sent, it must match an existing LeadSource.code or LeadSource.name.
   */
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional() @Transform(optionalText) @IsString() @MaxLength(50)
  registrationNumber?: string;

  @IsOptional() @Transform(optionalText) @IsString() @MaxLength(50)
  nationalId?: string;

  @IsOptional() @Transform(optionalText) @IsString() @MaxLength(50)
  economicCode?: string;

  @IsOptional() @Transform(optionalText) @IsApiDateString()
  establishmentDate?: string;

  @IsOptional() @IsEnum(CompanyActivityStatus)
  activityStatus?: CompanyActivityStatus;

  @IsOptional() @Transform(optionalText) @IsString() @Matches(/^\d+(\.\d{1,2})?$/) @MaxLength(27)
  registeredCapital?: string;

  @IsOptional() @Transform(optionalInteger) @IsInt() @Min(0)
  employeeCount?: number;

  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true })
  parentCompanyIds?: string[];

  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true })
  subsidiaryCompanyIds?: string[];
}
