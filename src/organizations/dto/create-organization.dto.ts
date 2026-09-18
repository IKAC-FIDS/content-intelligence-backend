import {
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9][a-z0-9-_]*$/)
  code!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  locale?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
