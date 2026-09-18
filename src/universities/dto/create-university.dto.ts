import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateUniversityDto {
  @IsString() @MaxLength(300) name!: string;
  @IsOptional() @IsString() @MaxLength(50) code?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
