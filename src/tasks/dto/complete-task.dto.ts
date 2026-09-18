import { IsOptional, IsString } from 'class-validator';

export class CompleteTaskDto {
  @IsOptional()
  @IsString()
  completionNote?: string;
}