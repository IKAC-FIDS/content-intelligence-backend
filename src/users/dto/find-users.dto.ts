import { Transform } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindUsersDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  team?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
