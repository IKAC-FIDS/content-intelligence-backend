import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const booleanQuery = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};

export class FindTeamsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @Transform(booleanQuery)
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(booleanQuery)
  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;

  @IsOptional()
  @IsUUID()
  managerId?: string;
}
