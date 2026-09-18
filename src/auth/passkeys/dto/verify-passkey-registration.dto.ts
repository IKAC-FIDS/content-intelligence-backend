import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyPasskeyRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;

  @IsObject()
  response: Record<string, unknown>;
}
