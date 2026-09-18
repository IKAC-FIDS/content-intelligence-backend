import {
  NotificationEntityType,
  NotificationPriority,
  NotificationType,
} from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindNotificationsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @IsOptional()
  @IsEnum(NotificationEntityType)
  entityType?: NotificationEntityType;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  status?: 'unread' | 'read' | 'all';

  @IsOptional()
  @IsString()
  includeArchived?: 'true' | 'false';

  @IsOptional()
  @IsString()
  archivedOnly?: 'true' | 'false';

  @IsOptional()
  @IsString()
  search?: string;
}