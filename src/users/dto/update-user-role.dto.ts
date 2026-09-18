import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserRoleDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsString()
  team?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string | null;
}
