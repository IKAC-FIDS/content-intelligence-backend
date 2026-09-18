import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class FindOwnerOptionsDto {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 25;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  selectedId?: string;
}
