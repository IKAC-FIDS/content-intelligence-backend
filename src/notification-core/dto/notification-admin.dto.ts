import { Transform, Type } from "class-transformer"
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator"
import { NotificationChannel, NotificationDeliveryStatus, NotificationTriggerType } from "@prisma/client"

export class NotificationTemplateQueryDto {
  @IsOptional() @IsString() eventName?: string
  @IsOptional() @IsEnum(NotificationChannel) channel?: NotificationChannel
  @IsOptional() @IsString() locale?: string
  @IsOptional() @IsString() search?: string
  @IsOptional() @Transform(({ value }) => value === "true" ? true : value === "false" ? false : value) @IsBoolean() isActive?: boolean
}

export class PreviewNotificationTemplateDto {
  @IsString() @IsNotEmpty() eventName!: string
  @IsEnum(NotificationChannel) channel!: NotificationChannel
  @IsOptional() @IsString() locale?: string
  @IsOptional() @IsString() subject?: string | null
  @IsString() @IsNotEmpty() body!: string
}

export class CreateNotificationTemplateDto {
  @IsString() @IsNotEmpty() eventName!: string
  @IsEnum(NotificationChannel) channel!: NotificationChannel
  @IsOptional() @IsString() locale?: string
  @IsOptional() @IsString() subject?: string | null
  @IsString() @IsNotEmpty() body!: string
  @IsOptional() @IsBoolean() isActive?: boolean
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) version?: number
}

export class UpdateNotificationTemplateDto {
  @IsOptional() @IsString() @IsNotEmpty() eventName?: string
  @IsOptional() @IsEnum(NotificationChannel) channel?: NotificationChannel
  @IsOptional() @IsString() locale?: string
  @IsOptional() @IsString() subject?: string | null
  @IsOptional() @IsString() @IsNotEmpty() body?: string
  @IsOptional() @IsBoolean() isActive?: boolean
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) version?: number
}

export class NotificationDeliveryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20
  @IsOptional() @IsString() eventName?: string
  @IsOptional() @IsEnum(NotificationChannel) channel?: NotificationChannel
  @IsOptional() @IsEnum(NotificationDeliveryStatus) status?: NotificationDeliveryStatus
  @IsOptional() @IsUUID() recipientUserId?: string
  @IsOptional() @IsUUID() ruleId?: string
  @IsOptional() @IsUUID() templateId?: string
  @IsOptional() @IsEnum(NotificationTriggerType) triggerType?: NotificationTriggerType
  @IsOptional() @IsString() provider?: string
  @IsOptional() @IsString() aggregateType?: string
  @IsOptional() @IsString() aggregateId?: string
  @IsOptional() @IsString() dateFrom?: string
  @IsOptional() @IsString() dateTo?: string
  @IsOptional() @IsString() search?: string
  @IsOptional() @IsIn(["createdAt", "sentAt", "deliveredAt", "status", "channel"]) sortBy: "createdAt" | "sentAt" | "deliveredAt" | "status" | "channel" = "createdAt"
  @IsOptional() @IsIn(["asc", "desc"]) sortDirection: "asc" | "desc" = "desc"
}
