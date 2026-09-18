import { IsEnum, IsString, IsNotEmpty } from 'class-validator';
import { UserRole } from '@prisma/client';

export class AssignPermissionDto {
  @IsEnum(UserRole)
  role!: UserRole;

  @IsString()
  @IsNotEmpty()
  action!: string;
}