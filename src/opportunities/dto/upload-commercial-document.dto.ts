import {
  CommercialDocumentStatus,
  CommercialDocumentType,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === undefined ? undefined : value;

const optionalNumber = ({ value }: { value: unknown }) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  return Number(value);
};

const optionalBoolean = ({ value }: { value: unknown }) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  if (value === true || value === 'true' || value === '1') {
    return true;
  }

  if (value === false || value === 'false' || value === '0') {
    return false;
  }

  return value;
};

export class UploadCommercialDocumentDto {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(CommercialDocumentType)
  type?: CommercialDocumentType;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(CommercialDocumentType)
  documentType?: CommercialDocumentType;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(CommercialDocumentStatus)
  status?: CommercialDocumentStatus;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(80)
  number?: string;

  @IsOptional()
  @Transform(optionalNumber)
  @IsNumber()
  @Min(1)
  version?: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(optionalNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsApiDateString()
  validUntil?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsApiDateString()
  dueDate?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsApiDateString()
  expiresAt?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsApiDateString()
  issuedAt?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsApiDateString()
  issueDate?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsApiDateString()
  sentAt?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsApiDateString()
  acceptedAt?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsApiDateString()
  rejectedAt?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsApiDateString()
  signedAt?: string;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  isSigned?: boolean;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  externalUrl?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  externalRef?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  notes?: string;
}
