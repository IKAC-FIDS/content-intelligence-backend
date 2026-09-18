import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export class ArchiveCompanyDto {
  @Transform(({ value }) => typeof value === 'string' && value.trim() === '' ? undefined : value?.trim())
  @IsOptional()
  @IsString()
  reason?: string;
}
