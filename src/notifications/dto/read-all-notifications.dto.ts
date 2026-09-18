import { NotificationEntityType, NotificationType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ReadAllNotificationsDto {
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationEntityType)
  entityType?: NotificationEntityType;

  @IsOptional()
  @IsString()
  entityId?: string;
}