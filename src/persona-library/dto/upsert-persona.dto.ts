import { IsOptional, IsString } from 'class-validator';

export class UpsertPersonaDto {
  @IsString()
  titlePattern: string;

  @IsOptional()
  @IsString()
  defaultPainPoint?: string;

  @IsOptional()
  @IsString()
  defaultUseCase?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
