import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  @IsNotEmpty()
  action!: string;

  @IsOptional()
  @IsString()
  description?: string;
}