import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateLookupOptionDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  code!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  label!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
