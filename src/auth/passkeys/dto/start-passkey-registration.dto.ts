import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StartPasskeyRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}
