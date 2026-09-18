import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class CompleteActivityDto {
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  outcome?: string;

  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  completionNote?: string;
}
