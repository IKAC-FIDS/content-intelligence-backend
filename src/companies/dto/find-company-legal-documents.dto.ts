import { CompanyLegalDocumentType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/pagination/pagination.dto';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

export class FindCompanyLegalDocumentsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(CompanyLegalDocumentType)
  type?: CompanyLegalDocumentType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsApiDateString()
  dateFrom?: string;

  @IsOptional()
  @IsApiDateString()
  dateTo?: string;

  @IsOptional()
  @IsIn(['createdAt', 'documentDate'])
  sortBy?: 'createdAt' | 'documentDate' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
