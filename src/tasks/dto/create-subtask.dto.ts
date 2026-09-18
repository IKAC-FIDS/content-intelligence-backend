import { Priority, TaskAssignmentScope } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

export class CreateSubtaskDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsEnum(TaskAssignmentScope)
  assignmentScope?: TaskAssignmentScope;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsApiDateString()
  dueAt?: string;

  @IsOptional()
  @IsBoolean()
  inheritLinkedEntity = true;
}
