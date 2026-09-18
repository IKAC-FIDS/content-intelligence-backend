import { CompanyLegalDocumentType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === undefined ? undefined : value;

export class UploadCompanyLegalDocumentDto {
  @IsEnum(CompanyLegalDocumentType)
  type!: CompanyLegalDocumentType;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsApiDateString()
  documentDate?: string;
}

export class UpdateCompanyLegalDocumentDto {
  @IsOptional() @IsEnum(CompanyLegalDocumentType)
  type?: CompanyLegalDocumentType;

  @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsApiDateString()
  documentDate?: string;
}
