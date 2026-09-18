import { IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindPeopleDto extends PaginationDto {
  @IsUUID()
  @IsOptional()
  companyId?: string;
}