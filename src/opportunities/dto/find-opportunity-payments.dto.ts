import { PaymentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

export class FindOpportunityPaymentsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsString()
  commercialDocumentId?: string;

  @IsOptional()
  @IsApiDateString()
  dueFrom?: string;

  @IsOptional()
  @IsApiDateString()
  dueTo?: string;
}
