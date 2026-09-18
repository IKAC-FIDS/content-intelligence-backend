import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class FindTaskOptionsDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 25;
}

export class FindTaskEntityOptionsDto extends FindTaskOptionsDto {
  @IsIn(['COMPANY', 'OPPORTUNITY', 'PERSON', 'MEETING', 'ACTIVITY', 'PRODUCT'])
  type!: 'COMPANY' | 'OPPORTUNITY' | 'PERSON' | 'MEETING' | 'ACTIVITY' | 'PRODUCT';
}
