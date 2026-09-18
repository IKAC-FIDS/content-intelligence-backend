import { readFileSync } from 'fs';
import { join } from 'path';
describe('fix 000092 additive migration', () => {
  const sql = readFileSync(join(process.cwd(), 'prisma/migrations/20260813100000_plan_subscription_entitlements/migration.sql'), 'utf8');
  it('creates the controlled catalog and commercial tables without destructive DDL', () => { expect(sql).toContain('CREATE TYPE "FeatureKey"'); expect(sql).toContain('CREATE TABLE "plans"'); expect(sql).toContain('CREATE TABLE "subscriptions"'); expect(sql).toContain('CREATE TABLE "organization_entitlements"'); expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)/i); expect(sql).not.toMatch(/TRUNCATE/i); });
  it('enforces one current subscription and date invariants', () => { expect(sql).toContain('subscriptions_one_current_per_organization_key'); expect(sql).toContain("WHERE \"status\" IN ('PENDING', 'ACTIVE', 'SUSPENDED')"); expect(sql).toContain('subscriptions_dates_check'); expect(sql).toContain('subscriptions_grace_check'); });
  it('keeps commercial and RBAC versioning separate', () => { expect(sql).toContain('"entitlementVersion"'); expect(sql).not.toContain('"authorizationVersion"'); });
});
