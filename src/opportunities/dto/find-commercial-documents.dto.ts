import {
  CommercialDocumentStatus,
  CommercialDocumentType,
} from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindCommercialDocumentsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(CommercialDocumentType)
  type?: CommercialDocumentType;

  @IsOptional()
  @IsEnum(CommercialDocumentStatus)
  status?: CommercialDocumentStatus;

  @IsOptional()
  @IsString()
  search?: string;
}