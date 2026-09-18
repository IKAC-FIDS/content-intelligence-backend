import { ApiProperty } from '@nestjs/swagger';
import { QuotaMetric, QuotaResetPeriod } from '@prisma/client';
import { QUOTA_CONFIGURATION_STATES, QuotaConfigurationState } from '../quota-resolver.service';

export class QuotaSummaryMetricDto {
  @ApiProperty({ enum: QuotaMetric, enumName: 'QuotaMetric' }) metric: QuotaMetric;
  @ApiProperty({ enum: QUOTA_CONFIGURATION_STATES, enumName: 'QuotaConfigurationState' }) state: QuotaConfigurationState;
  @ApiProperty({ type: String, pattern: '^(0|[1-9]\\d*)$' }) current: string;
  @ApiProperty({ type: String, nullable: true, pattern: '^(0|[1-9]\\d*)$' }) softLimit: string | null;
  @ApiProperty({ type: String, nullable: true, pattern: '^(0|[1-9]\\d*)$' }) hardLimit: string | null;
  @ApiProperty({ enum: QuotaResetPeriod, enumName: 'QuotaResetPeriod' }) resetPeriod: QuotaResetPeriod;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) resetAt: string | null;
  @ApiProperty({ type: Number, nullable: true, enum: [80, 90] }) threshold: number | null;
}

export class QuotaSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) organizationId: string;
  @ApiProperty({ type: String, format: 'date-time' }) generatedAt: string;
  @ApiProperty({ type: [QuotaSummaryMetricDto] }) metrics: QuotaSummaryMetricDto[];
}
