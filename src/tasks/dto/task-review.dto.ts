import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SubmitTaskReviewDto {
  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  artifactIds?: string[];
}

export class TaskReviewDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string;
}
