import { IsBoolean, IsHexColor, IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export const TERMINAL_TYPES = ['WON', 'LOST', 'ON_HOLD', 'NONE'] as const;

export class UpdateStageConfigDto {
  @IsOptional() @IsString() @IsNotEmpty() label?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsHexColor() color?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isTerminal?: boolean;
  @IsOptional() @IsIn(TERMINAL_TYPES) terminalType?: string | null;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
