import { IsOptional, IsString, IsArray, IsUUID } from 'class-validator';

export class CreateIndustryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  painPointIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  useCaseIds?: string[];
}