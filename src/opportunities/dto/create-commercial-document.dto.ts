import {
  CommercialDocumentStatus,
  CommercialDocumentType,
} from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

export class CreateCommercialDocumentDto {
  @IsEnum(CommercialDocumentType)
  type!: CommercialDocumentType;

  @IsOptional()
  @IsEnum(CommercialDocumentStatus)
  status?: CommercialDocumentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  number?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  version?: number;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsApiDateString()
  validUntil?: string;

  @IsOptional()
  @IsApiDateString()
  issuedAt?: string;

  @IsOptional()
  @IsApiDateString()
  sentAt?: string;

  @IsOptional()
  @IsApiDateString()
  acceptedAt?: string;

  @IsOptional()
  @IsApiDateString()
  rejectedAt?: string;

  @IsOptional()
  @IsApiDateString()
  signedAt?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
