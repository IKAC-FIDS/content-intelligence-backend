import { Type } from "class-transformer"
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator"

export class UpdateSmsSettingsDto {
  @IsString() @IsNotEmpty() @MaxLength(80) provider!: string
  @IsString() @IsNotEmpty() @MaxLength(2000) apiUrl!: string
  @IsOptional() @IsString() @MaxLength(2000) apiKey?: string
  @IsOptional() @IsBoolean() clearApiKey?: boolean
  @IsString() @IsNotEmpty() @MaxLength(80) senderNumber!: string
  @IsBoolean() enabled!: boolean
  @IsOptional() @Type(() => Number) @IsInt() @Min(1000) @Max(60000) timeoutMs?: number
}

export class TestSmsDto {
  @IsString() @IsNotEmpty() @MaxLength(40) recipient!: string
  @IsOptional() @IsString() @MaxLength(1000) message?: string
}
