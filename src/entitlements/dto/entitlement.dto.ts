import { EntitlementOverrideState, FeatureKey, SubscriptionStatus, SubscriptionType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const code = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreatePlanDto {
  @Transform(code) @Matches(/^[A-Z][A-Z0-9_]*$/) @MaxLength(50) code!: string;
  @Transform(trim) @IsString() @MaxLength(200) name!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
}
export class UpdatePlanDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class SetPlanFeatureDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsObject() value?: Record<string, unknown>;
}
export class CreateSubscriptionDto {
  @IsUUID('4') planId!: string;
  @IsEnum(SubscriptionType) type!: SubscriptionType;
  @IsOptional() @IsEnum(SubscriptionStatus) status?: SubscriptionStatus;
  @IsDateString() startAt!: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsDateString() gracePeriodEndAt?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) contractReference?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) internalNote?: string;
}
export class TransitionSubscriptionDto { @IsEnum(SubscriptionStatus) status!: SubscriptionStatus; }
export class UpdateSubscriptionDto {
  @IsOptional() @IsUUID('4') planId?: string;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string | null;
  @IsOptional() @IsDateString() gracePeriodEndAt?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) contractReference?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) internalNote?: string;
}
export class SetEntitlementOverrideDto {
  @IsEnum(EntitlementOverrideState) state!: EntitlementOverrideState;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) reason?: string;
}
export class EntitlementMaintenanceDto {
  @IsUUID('4') organizationId!: string;
  @IsUUID('4') planId!: string;
  @IsOptional() @IsEnum(SubscriptionType) type?: SubscriptionType;
  @IsOptional() @IsInt() @Min(1) durationDays?: number;
}
export { FeatureKey };
