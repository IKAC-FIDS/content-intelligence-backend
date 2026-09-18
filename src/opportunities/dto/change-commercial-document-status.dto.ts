import { CommercialDocumentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ChangeCommercialDocumentStatusDto {
  @IsEnum(CommercialDocumentStatus)
  status!: CommercialDocumentStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}