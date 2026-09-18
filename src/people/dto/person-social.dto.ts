import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreatePersonSocialDto {
  @IsOptional()
  @IsUUID()
  platformOptionId?: string;

  /**
   * Deprecated compatibility input.
   * Prefer platformOptionId.
   * If sent, it must match LookupOption.code or LookupOption.label in group = social_types.
   */
  @IsOptional()
  @IsString()
  platform?: string;

  @IsString()
  handle!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePersonSocialDto {
  @IsOptional()
  @IsUUID()
  platformOptionId?: string;

  /**
   * Deprecated compatibility input.
   * Prefer platformOptionId.
   */
  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  handle?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}