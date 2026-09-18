import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
const bool = ({ value }: { value: unknown }) => value === true || value === 'true';
export class FindAssigneeOptionsDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsUUID() selectedId?: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @Transform(bool) @IsBoolean() activeOnly = true;
}
