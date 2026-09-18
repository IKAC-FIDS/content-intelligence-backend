import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const normalizeCode = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '_') : value;

export class CreateTenantRoleDto {
  @Transform(normalizeCode) @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/) @MaxLength(50) code!: string;
  @Transform(trim) @IsString() @MaxLength(200) name!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsEnum(UserRole) baseRole?: UserRole;
}

export class UpdateTenantRoleDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ReplaceTenantRolePermissionsDto {
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) permissionIds!: string[];
}

export class AssignMembershipRoleDto {
  @IsUUID('4') roleId!: string;
}
