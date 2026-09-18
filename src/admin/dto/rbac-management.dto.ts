import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const code = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '_') : value;
export class CreateManagedPermissionDto {
  @Transform(trim) @IsString() @Matches(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/) @MaxLength(120) action!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) group?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateManagedPermissionDto {
  @IsOptional() @Transform(trim) @IsString() @Matches(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/) @MaxLength(120) action?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) group?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class CreateRoleDto {
  @Transform(code) @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/) @MaxLength(50) code!: string;
  @Transform(trim) @IsString() @MaxLength(200) name!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsEnum(UserRole) baseRole?: UserRole;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateRoleDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsEnum(UserRole) baseRole?: UserRole;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class ReplaceRolePermissionsDto {
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) permissionIds!: string[];
}
