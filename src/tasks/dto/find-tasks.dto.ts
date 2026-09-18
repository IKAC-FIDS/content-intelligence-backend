import { Priority, TaskAssignmentScope, TaskReviewStatus, TaskStatus } from '@prisma/client';
import { IsBooleanString, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

export class FindTasksDto extends PaginationDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsOptional()
  @IsUUID()
  commercialDocumentId?: string;

  @IsOptional()
  @IsUUID()
  paymentId?: string;

  @IsOptional()
  @IsApiDateString()
  dueFrom?: string;

  @IsOptional()
  @IsApiDateString()
  dueTo?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBooleanString()
  overdueOnly?: string;

  @IsOptional()
  @IsEnum(TaskAssignmentScope)
  assignmentScope?: TaskAssignmentScope;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  parentTaskId?: string;

  @IsOptional()
  @IsUUID()
  meetingId?: string;

  @IsOptional()
  @IsUUID()
  activityId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsIn(['all', 'mine', 'team', 'organization', 'created'])
  view?: 'all' | 'mine' | 'team' | 'organization' | 'created';

  @IsOptional()
  @IsIn(['none', 'upcoming', 'today', 'overdue', 'completed'])
  dueState?: 'none' | 'upcoming' | 'today' | 'overdue' | 'completed';

  @IsOptional()
  @IsIn(['COMPANY', 'OPPORTUNITY', 'PERSON', 'MEETING', 'ACTIVITY', 'PRODUCT'])
  linkedEntityType?: 'COMPANY' | 'OPPORTUNITY' | 'PERSON' | 'MEETING' | 'ACTIVITY' | 'PRODUCT';

  @IsOptional()
  @IsEnum(TaskReviewStatus)
  reviewStatus?: TaskReviewStatus;

  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @IsBooleanString()
  awaitingMyReview?: string;
}
