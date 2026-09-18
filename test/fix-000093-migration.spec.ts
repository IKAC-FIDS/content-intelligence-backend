import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const sql = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260813190000_quota_usage_metering/migration.sql',
  ),
  'utf8',
);
describe('fix 000093 additive migration', () => {
  it('adds the stable metric catalog and reset/reservation enums', () => {
    expect(sql).toContain('CREATE TYPE "QuotaMetric"');
    for (const metric of [
      'ACTIVE_USERS',
      'COMPANIES',
      'OPPORTUNITIES',
      'FILES',
      'STORAGE_BYTES',
      'API_CALLS',
      'WORKFLOW_RUNS',
      'WEBHOOK_DELIVERIES',
      'EMAIL_SENDS',
      'AI_REQUESTS',
    ])
      expect(sql).toContain(`'${metric}'`);
  });
  it.each([
    'plan_quotas',
    'organization_quota_overrides',
    'usage_counters',
    'usage_snapshots',
    'quota_threshold_events',
    'usage_reservations',
    'usage_events',
  ])('adds %s', (table) => expect(sql).toContain(`CREATE TABLE "${table}"`));
  it('uses tenant-scoped uniqueness and restrictive foreign keys', () => {
    expect(sql).toContain(
      'usage_counters_organizationId_metric_periodStart_key',
    );
    expect(sql).toContain(
      'usage_events_organizationId_metric_idempotencyKey_key',
    );
    expect(
      (sql.match(/ON DELETE RESTRICT/g) ?? []).length,
    ).toBeGreaterThanOrEqual(8);
  });
  it('enforces non-negative, period, limit-order, threshold and reservation constraints', () => {
    for (const check of [
      'non_negative_check',
      'period_check',
      'limit_order_check',
      'threshold_check',
      'amount_check',
    ])
      expect(sql).toContain(check);
  });
  it('contains no destructive or data-rewrite SQL', () =>
    expect(sql).not.toMatch(
      /\b(DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+"|ALTER\s+COLUMN)\b/i,
    ));
});
