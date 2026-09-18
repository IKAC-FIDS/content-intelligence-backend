import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/pagination/pagination.dto';

export class FindCompanyBranchesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;
}
