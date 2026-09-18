import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateEmailSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsString() @MaxLength(255) host!: string;
  @IsInt() @Min(1) @Max(65535) port!: number;
  @IsBoolean() secure!: boolean;
  @IsOptional() @IsString() @MaxLength(255) username?: string;
  @IsOptional() @IsString() @MaxLength(1000) password?: string;
  @IsEmail() @MaxLength(320) fromEmail!: string;
  @IsOptional() @IsString() @MaxLength(200) fromName?: string;
  @IsOptional() @IsEmail() @MaxLength(320) replyTo?: string;
}

export class TestEmailDto {
  @IsEmail() @MaxLength(320) to!: string;
}
