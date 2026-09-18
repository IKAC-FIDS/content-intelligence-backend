import { IsUUID } from 'class-validator';

export class AssignTaskDto {
  @IsUUID()
  assignedToId!: string;
}