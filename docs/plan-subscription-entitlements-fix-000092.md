# fix 000092 — Plan, Subscription and Feature Entitlements

## Architecture and commercial policy

Entitlement is evaluated after identity, active tenant Membership and RBAC; it never grants authorization. `PlatformAuthority`, Tenant Owner, Tenant Role and subscription remain separate. The stable Feature enum contains only capabilities evidenced by current modules: `SSO`, `PASSKEY`, `ADVANCED_RBAC`, `CUSTOM_DOMAINS`, `BRANDING`, `AUDIT`, and `REPORTING`.

Plans are mutable, revisioned v1 definitions. Changes are audited and invalidate every current subscriber through `Organization.entitlementVersion`; historical Subscription rows retain their Plan reference but v1 intentionally does not snapshot a Plan revision. This is a documented remaining risk for later immutable commercial revisions. Starter, Business and Enterprise shells can be bootstrapped, but no Feature matrix is guessed. Every Feature must be explicitly configured after Product/Commercial approval before compatibility backfill accepts a Plan.

There is one current `PENDING`, `ACTIVE`, or `SUSPENDED` Subscription per Organization; historical `CANCELLED`/`EXPIRED` rows remain. An advisory transaction lock and partial unique index protect concurrency. Allowed transitions are PENDING→ACTIVE/CANCELLED, ACTIVE→SUSPENDED/CANCELLED/EXPIRED, and SUSPENDED→ACTIVE/CANCELLED/EXPIRED. Trial requires an end; Manual Contract may be open-ended. Storage is UTC with start inclusive and end/grace end exclusive. Grace retains the same Plan/override feature result. Suspension disables all subscription-controlled Features but deletes no data and does not affect Platform recovery access. Security resolves expiration from current time and never depends on a scheduler.

Resolution precedence is active Organization, latest Subscription and state/time, Plan baseline, then Organization override. ARCHIVED, SUSPENDED and PENDING_SETUP Organizations are denied. A known Feature for an Organization with zero Subscription history uses observable `LEGACY_COMPATIBILITY`; after any Subscription exists, inactive/expired states deny access. Unknown Features always deny. Tenant read output contains effective feature, source, safe Plan code and Subscription ID only; internal note is Platform-only.

RLS for Subscription and OrganizationEntitlement is deferred: platform management is cross-Organization and tenant reads are centralized through exact trusted TenantContext queries. Application lookups are fail-closed and tested. Notification RLS is unchanged. A future RLS design must preserve Platform/migration identity and runtime `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`.

## Maintenance commands

```text
npm run entitlements:preflight -- --organization <EXACT_ORGANIZATION_UUID>
npm run entitlements:bootstrap:dry-run
npm run entitlements:bootstrap
npm run entitlements:backfill:dry-run -- --organization <EXACT_ORGANIZATION_UUID> --plan <EXACT_PLAN_UUID>
npm run entitlements:backfill -- --organization <EXACT_ORGANIZATION_UUID> --plan <EXACT_PLAN_UUID>
npm run entitlements:backfill -- --organization <EXACT_ORGANIZATION_UUID> --plan <EXACT_PLAN_UUID>
npm run entitlements:validate -- --organization <EXACT_ORGANIZATION_UUID>
```

Bootstrap creates only missing Plan shells and reports `UNASSIGNED_REQUIRES_COMMERCIAL_APPROVAL`. It does not enable Features. Backfill requires exact IDs, an active Plan with an explicit row for every Feature, creates an open-ended Manual Contract compatibility Subscription, never modifies Organization identity/RBAC/Owner/SSO, and is idempotent.

## Migration SQL review

The additive migration creates four enums, adds one non-null Organization integer with constant default, and creates four empty tables. Unique indexes cover Plan code, PlanFeature, override and one-current-Subscription invariants. CHECK constraints enforce end after start and grace after end. All FKs use RESTRICT; no tenant business row cascades. There is no UPDATE, delete, destructive DDL, automatic Plan assignment, Feature matrix or data rewrite. `ALTER TABLE` takes a short ACCESS EXCLUSIVE lock; non-concurrent indexes scan only new empty tables except the Organization column change. PostgreSQL version/storage behavior must be confirmed on the isolated restore. Enum rollback is not routine.

## Production runbook — documentation only

Production path `/opt/CRM/iam-crm-backend`; Compose project `iam-crm-backend`; API `iam-crm-backend-api-1`; DB `iam-crm-backend-db-1`. Codex must not execute these instructions. PuTTY blocks must not use `exit`, `exit 1`, `set -e`, or `set -euo pipefail`. On any failed gate print `echo "STOP: <reason>. Do not continue."` and stop manually.

1. Record current HEAD/origin/main, exact approved Fix92 SHA, complete incoming range/files, reviewed migration/maintenance scripts, service health, API image SHA, disk, Compose config and migration status. Preserve `.env`, `.env.docker`, overrides and deployment-only files; tag the current API image.
2. Create a fresh PostgreSQL backup and SHA256 checksum. Restore into a genuinely clean isolated PostgreSQL instance with zero errors. **Do not begin schema changes until the test restore has succeeded.** `pg_restore --list` alone is insufficient.
3. Record migrations, Organizations/lifecycle, users, Memberships/Owners, PlatformAuthorities, Roles/Permissions, SSO, settings/domains, existing commercial rows and Notification RLS/runtime-role attributes. This fix does not touch MinIO objects, so no fix-specific MinIO backup is required beyond normal policy.
4. On the restore, run migration, preflight, Plan bootstrap dry-run/apply only after approved matrix planning, configure the approved matrix via Platform control plane, exact-tenant backfill dry-run/apply twice, validate, and confirm existing-company features. Recompare PlatformAuthority, TenantOwner, RBAC, SSO, Organization IDs/status, Notification RLS and runtime role.
5. Inspect/fetch and ff-only update to the exact SHA. Build only API. Stop only API; do not restart DB, recreate MinIO or remove volumes. Apply migration with `MIGRATION_DATABASE_URL`.
6. Run Production preflight, reviewed Plan bootstrap, approved Feature configuration, exact compatibility dry-run, human count review, confirmed apply, second idempotent apply and validation. Verify all security/data baselines and no unexpected count changes.
7. Recreate only API with `docker compose --env-file .env.docker -p iam-crm-backend up -d --no-deps --force-recreate api`. Check status/logs, actual `/api/health`, frontend proxy health, authenticated enabled/disabled SSO behavior, Platform plan/subscription operations without tenant membership, Tenant Admin mutation denial, cross-tenant negatives, expiration/grace and final Git/image/migration/count state.

Stop for restore/migration/preflight/matrix/backfill/validation failure, ambiguity, changed Organization identity, privilege/RBAC/Owner/SSO/RLS regression, feature mismatch, cross-tenant disclosure, health failure, or unexpected data counts.

## Rollback and deferred work

Prefer the tagged application image while retaining additive tables and history. Pre-Fix92 ignores these tables safely, but after enforcement/backfill an old image no longer enforces commercial controls. At that boundary quarantine subscription-controlled write endpoints (including SSO administration), keep Platform remediation available, and forward-fix. Do not delete Subscription history or restore an old database over valid newer data.

Online payment, recurring billing, cards, invoice automation, checkout, quota enforcement, immutable Plan revision snapshots, automatic reporting-state normalization and commercial matrix approval are deferred. Subscription/override RLS is future hardening.
