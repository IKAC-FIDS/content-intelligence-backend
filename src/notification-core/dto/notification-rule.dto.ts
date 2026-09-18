import { Type } from "class-transformer"
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator"
import { NotificationChannel, NotificationPriority, NotificationRecipientType, NotificationScheduleTriggerMode, NotificationScheduleType } from "@prisma/client"

export class NotificationScheduleInputDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsEnum(NotificationScheduleType)
  type!: NotificationScheduleType

  @IsString()
  @IsNotEmpty()
  sourceField!: string

  @IsEnum(NotificationScheduleTriggerMode)
  triggerMode!: NotificationScheduleTriggerMode

  @IsInt()
  offsetMinutes!: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(525600)
  gracePeriodMinutes?: number
}

export class NotificationRecipientRuleInputDto {
  @IsEnum(NotificationRecipientType)
  type!: NotificationRecipientType

  @IsOptional()
  @IsString()
  targetId?: string | null

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(NotificationChannel, { each: true })
  channels!: NotificationChannel[]

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

export class CreateNotificationRuleDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsNotEmpty()
  eventName!: string

  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsBoolean()
  mandatory?: boolean

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  priority?: number

  @IsOptional()
  @IsEnum(NotificationPriority)
  deliveryPriority?: NotificationPriority

  @IsOptional()
  @IsString()
  digestPolicyId?: string | null

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown> | null

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationScheduleInputDto)
  schedule?: NotificationScheduleInputDto

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => NotificationRecipientRuleInputDto)
  recipientRules!: NotificationRecipientRuleInputDto[]
}

export class UpdateNotificationRuleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  eventName?: string

  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsBoolean()
  mandatory?: boolean

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  priority?: number

  @IsOptional()
  @IsEnum(NotificationPriority)
  deliveryPriority?: NotificationPriority

  @IsOptional()
  @IsString()
  digestPolicyId?: string | null

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown> | null

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationScheduleInputDto)
  schedule?: NotificationScheduleInputDto

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => NotificationRecipientRuleInputDto)
  recipientRules?: NotificationRecipientRuleInputDto[]
}
