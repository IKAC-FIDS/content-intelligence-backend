import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Content Intelligence Foundation baseline migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260926000000_initial_content_intelligence_foundation/migration.sql',
    ),
    'utf8',
  );

  const foundationTables = [
    'users',
    'teams',
    'organizations',
    'organization_settings',
    'organization_branding',
    'organization_domains',
    'user_passkeys',
    'sso_providers',
    'sso_provider_routes',
    'sso_group_role_mappings',
    'sso_auth_transactions',
    'external_identities',
    'sso_login_tickets',
    'refresh_sessions',
    'audit_logs',
    'audit_log_archives',
    'audit_retention_policies',
    'permissions',
    'roles',
    'organization_memberships',
    'organization_membership_teams',
    'platform_authorities',
    'role_permissions',
    'plans',
    'plan_features',
    'subscriptions',
    'organization_entitlements',
    'plan_quotas',
    'organization_quota_overrides',
    'usage_counters',
    'usage_snapshots',
    'quota_threshold_events',
    'usage_reservations',
    'usage_events',
    'file_attachments',
  ];

  it('creates every retained Foundation table exactly once', () => {
    const created = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(created.sort()).toEqual([...foundationTables].sort());
  });

  it('contains no retired or future product domain object', () => {
    expect(sql).not.toMatch(
      /compan(?:y|ies)|opportunit|pipeline|activities|tasks|meetings|tenders|technical_documents|knowledge_base|commercial_documents|payments|conversations|workspaces|topics|keywords|monitoring_rules|contents|transcripts|translations|editorial_reviews/i,
    );
  });

  it('preserves non-Prisma Foundation integrity constraints', () => {
    for (const constraint of [
      'organization_memberships_default_active_check',
      'organization_memberships_one_active_default_per_user',
      'roles_scope_ownership_check',
      'organization_settings_firstDayOfWeek_check',
      'subscriptions_dates_check',
      'subscriptions_grace_check',
      'subscriptions_one_current_per_organization_key',
      'plan_quotas_non_negative_check',
      'organization_quota_overrides_non_negative_check',
      'usage_counters_non_negative_check',
      'usage_reservations_amount_check',
      'usage_events_amount_check',
      'audit_retention_policy_days_check',
    ]) {
      expect(sql).toContain(constraint);
    }
  });

  it('does not seed authority or application records in migration SQL', () => {
    expect(sql).not.toMatch(/INSERT\s+INTO|UPDATE\s+"|DELETE\s+FROM/i);
    expect(sql).not.toMatch(/DROP\s+(DATABASE|SCHEMA|TABLE)/i);
  });
});
