import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreatePersonContactDto {
  @IsUUID()
  typeOptionId!: string;

  @IsString()
  value!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePersonContactDto {
  @IsOptional()
  @IsUUID()
  typeOptionId?: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
