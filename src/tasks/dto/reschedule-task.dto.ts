import { IsOptional } from 'class-validator';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

export class RescheduleTaskDto {
  @IsApiDateString()
  dueAt!: string;

  @IsOptional()
  @IsApiDateString()
  reminderAt?: string;
}
