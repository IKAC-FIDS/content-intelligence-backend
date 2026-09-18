import { IsOptional, IsString } from 'class-validator';

export class CreateUseCaseDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string; // مثلاً "SSO", "MFA", "Governance"
}