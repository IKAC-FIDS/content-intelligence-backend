import { IsBoolean, IsHexColor, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { TERMINAL_TYPES } from './update-stage-config.dto';

export class CreateStageDto {
  @IsString() @IsNotEmpty() @Matches(/^[A-Za-z][A-Za-z0-9_ ]*$/) code!: string;
  @IsString() @IsNotEmpty() label!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isTerminal?: boolean;
  @IsOptional() @IsIn(TERMINAL_TYPES) terminalType?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
