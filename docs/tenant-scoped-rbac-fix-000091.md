# fix 000091 — Tenant-scoped RBAC and Membership Roles

## Model, compatibility, and safety

`Role.scope` separates platform-defined `SYSTEM` templates from Organization-owned `TENANT` roles. A Tenant role requires `organizationId` and `normalizedCode`; a System role requires null ownership. The existing one-role-per-membership relation remains because all current authorization, SSO, API, and frontend semantics select one effective role. `PlatformAuthority` and `OrganizationMembership.isTenantOwner` are never inferred from RBAC.

Runtime precedence is active User, active Organization, active Membership, valid Membership role, then active Role permissions. Legacy `User.role`, `User.roleId`, and `assignedRole` remain in schema/API compatibility surfaces, but do not override Membership authorization. Cache keys are `tenant-authz:<organization>:<user>:<membership>:<authorizationVersion>`; relevant tenant mutations increment the Organization version in the same transaction as audit. A System-role definition change must be performed by a future operator/platform-only workflow and must increment every Organization using it; tenant HTTP APIs cannot mutate System definitions.

The owner invariant uses a transaction-level advisory lock before evaluating an active real owner. A legacy zero-owner tenant may remain zero; once active owners exist, concurrent deactivation cannot transition the tenant to zero. Tenant RBAC tables do not receive RLS in this expansion: all runtime role/membership lookups are tenant-constrained and fail closed, while System templates and maintenance access require a separately reviewed RLS policy. Notification RLS remains untouched.

## Controlled maintenance commands

Every command requires an exact Organization UUID; broad execution is rejected.

```text
npm run tenant-rbac:preflight -- --organization <EXACT_ORGANIZATION_UUID>
npm run tenant-rbac:backfill:dry-run -- --organization <EXACT_ORGANIZATION_UUID>
npm run tenant-rbac:backfill -- --organization <EXACT_ORGANIZATION_UUID>
npm run tenant-rbac:backfill -- --organization <EXACT_ORGANIZATION_UUID>
npm run tenant-rbac:validate -- --organization <EXACT_ORGANIZATION_UUID>
```

Stop for zero/multiple target Memberships, invalid Role references, ambiguous enum mappings, cross-tenant roles, permission differences, invalid scope ownership, or active Memberships without roles. The second confirmed apply must report zero assignments. No owner is created or promoted.

## Production runbook — documentation only

Production path `/opt/CRM/iam-crm-backend`; Compose project `iam-crm-backend`; API `iam-crm-backend-api-1`; DB `iam-crm-backend-db-1`. Codex must not execute these commands. Interactive PuTTY instructions must not use `exit`, `exit 1`, `set -e`, or `set -euo pipefail`; on a failed gate print `echo "STOP: <reason>. Do not continue."` and stop manually.

1. Record current HEAD/origin/main, approved 000091 SHA, full incoming range/files, service status, API image SHA, disk space, Compose config, migration status, and current runtime role attributes. Preserve `.env`, `.env.docker`, Compose overrides and deployment-only files; tag the running API image for rollback.
2. Create a fresh PostgreSQL backup and SHA256 checksum. Restore it into a genuinely clean isolated PostgreSQL instance with zero restore errors. **Do not begin schema changes until the test restore has succeeded.** `pg_restore --list` alone is not verification.
3. Record Users, Organizations, Memberships, Roles, Permissions, RolePermissions, PlatformAuthorities, SSO Providers/mappings and migrations. Record legacy permission sets and active owner counts. MinIO backup is not fix-specific because 000091 does not touch objects, but retain the normal platform backup policy.
4. On the isolated restore, inspect the SQL, apply migration, run exact-Organization preflight, dry-run, confirmed backfill twice, validation, and permission-equivalence comparison. Verify no owner inference, unchanged PlatformAuthority/SSO relationships, Notification RLS ENABLE/FORCE, and runtime `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`.
5. Fetch safely, inspect again, and fast-forward only to the approved SHA. Build only API. Stop only API for maintenance; do not restart DB, recreate MinIO, or remove volumes. Apply Prisma migration explicitly with the migration-owner identity.
6. Run Production preflight and dry-run for each approved Organization. Review exact counts/conflicts before confirmed apply. Apply, repeat to prove idempotency, validate, and re-check permission equivalence, active owners, PlatformAuthority, SSO mappings, RLS, runtime role and counts.
7. Recreate only API: `docker compose --env-file .env.docker -p iam-crm-backend up -d --no-deps --force-recreate api`. Check status/logs and actual `/api/health`, then frontend proxy health. Smoke-test login/session, tenant switching, role list/create/grant/revoke, immediate version invalidation, same-user A/B permission separation, guessed cross-tenant UUID denial, System-role immutability, SSO mapping, and last-owner rejection with approved test accounts only.

Stop for any restore, migration, backfill, equivalence, count, owner, SSO, RLS, runtime-role, cross-tenant, cache, auth, or health failure.

## Migration SQL review and rollback

The migration creates one enum, adds one non-null integer with a constant default to Organizations, and adds three Role columns (scope has a constant default; ownership and normalized code are nullable). It creates one tenant-code unique index and one scope lookup index, a RESTRICT FK, and a scope/ownership check. It performs no UPDATE or business-data rewrite. `ALTER TABLE` takes short ACCESS EXCLUSIVE locks; index construction scans Roles and is not concurrent; uniqueness conflict risk is initially limited because new normalized codes are null. Enum removal and constraint rollback are not routine/automatic.

Prefer application image rollback while retaining additive schema and backfilled membership IDs. Legacy User role fields make pre-000091 reads possible, but crossing to Membership-authoritative writes means old code can create stale User/Membership divergence. If old-image rollback is required after backfill, quarantine role/permission/user-role mutation endpoints, retain tenant auth reads only after an authorization review, and forward-fix. Never delete RBAC rows or restore an old database over valid newer data as routine rollback. Later contraction may remove legacy User authority only after all environments prove equivalence; RBAC RLS and platform-controlled System-role mutation/version fan-out are separately reviewed future work.
