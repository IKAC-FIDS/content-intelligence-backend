import { IsOptional, IsString } from 'class-validator';

export class CreatePainPointDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string; // مثلاً "امنیت", "مدیریت", "هزینه"
}