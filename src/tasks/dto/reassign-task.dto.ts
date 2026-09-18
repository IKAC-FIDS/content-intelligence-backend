import { TaskAssignmentScope } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ReassignTaskDto {
  @IsEnum(TaskAssignmentScope)
  assignmentScope!: TaskAssignmentScope;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
