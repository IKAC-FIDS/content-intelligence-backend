import { UserRole } from '@prisma/client';
import { IsBoolean, IsDefined, IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class CreateTransitionDto {
  @IsOptional() @IsUUID() fromStageId?: string | null;
  @IsDefined() @ValidateIf((_, value) => value !== null) @IsUUID() toStageId!: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole | null;
  @IsBoolean() isAllowed!: boolean;
}
