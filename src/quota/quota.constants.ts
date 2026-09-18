import { QuotaMetric } from '@prisma/client';

export const INVENTORY_METRICS = new Set<QuotaMetric>([
  QuotaMetric.ACTIVE_USERS,
  QuotaMetric.COMPANIES,
  QuotaMetric.OPPORTUNITIES,
  QuotaMetric.FILES,
  QuotaMetric.STORAGE_BYTES,
]);

export const EVENT_METRICS = new Set<QuotaMetric>([
  QuotaMetric.API_CALLS,
  QuotaMetric.WORKFLOW_RUNS,
  QuotaMetric.WEBHOOK_DELIVERIES,
  QuotaMetric.EMAIL_SENDS,
  QuotaMetric.AI_REQUESTS,
]);

export const QUOTA_METRICS = Object.values(QuotaMetric);
export const QUOTA_THRESHOLDS = [80, 90] as const;
export const QUOTA_RESERVATION_TTL_MS = 15 * 60 * 1000;
