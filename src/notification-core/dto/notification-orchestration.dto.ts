import { Type } from "class-transformer"
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator"
import { NotificationChannel, NotificationDigestFrequency, NotificationPriority, NotificationQuietHoursMode, NotificationRecipientType } from "@prisma/client"
import { PartialType } from "@nestjs/mapped-types"

export class UpdateQuietHoursDto {
  @IsBoolean() enabled!: boolean
  @IsString() @IsNotEmpty() startTime!: string
  @IsString() @IsNotEmpty() endTime!: string
  @IsString() @IsNotEmpty() timezone!: string
  @IsArray() @ArrayNotEmpty() @IsEnum(NotificationChannel, { each: true }) channels!: NotificationChannel[]
  @IsBoolean() allowCritical!: boolean
  @IsEnum(NotificationQuietHoursMode) mode!: NotificationQuietHoursMode
}

export class CreateDigestPolicyDto {
  @IsString() @IsNotEmpty() name!: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsEnum(NotificationDigestFrequency) frequency?: NotificationDigestFrequency
  @IsString() @IsNotEmpty() sendTime!: string
  @IsString() @IsNotEmpty() timezone!: string
  @IsOptional() @IsString() @IsNotEmpty() subjectTemplate?: string
  @IsOptional() @IsString() @IsNotEmpty() introText?: string
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) eventNames!: string[]
  @IsArray() @ArrayNotEmpty() @IsEnum(NotificationChannel, { each: true }) channels!: NotificationChannel[]
}

export class UpdateDigestPolicyDto extends PartialType(CreateDigestPolicyDto) {}

export class EscalationStepDto {
  @IsInt() @Min(0) @Max(43200) delayMinutes!: number
  @IsEnum(NotificationRecipientType) recipientType!: NotificationRecipientType
  @IsOptional() @IsString() targetId?: string | null
  @IsArray() @ArrayNotEmpty() @IsEnum(NotificationChannel, { each: true }) channels!: NotificationChannel[]
  @IsOptional() @IsEnum(NotificationPriority) priority?: NotificationPriority
  @IsOptional() @IsBoolean() mandatory?: boolean
}

export class CreateEscalationPolicyDto {
  @IsString() @IsNotEmpty() name!: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsString() @IsNotEmpty() eventName!: string
  @IsOptional() @IsString() aggregateType?: string
  @IsOptional() @IsObject() conditions?: Record<string, unknown> | null
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => EscalationStepDto) steps!: EscalationStepDto[]
}

export class UpdateEscalationPolicyDto extends PartialType(CreateEscalationPolicyDto) {}

export class RuleOrchestrationDto {
  @IsOptional() @IsEnum(NotificationPriority) deliveryPriority?: NotificationPriority
  @IsOptional() @IsString() digestPolicyId?: string | null
}
