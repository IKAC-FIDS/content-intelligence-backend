# fix 000089 — Organization Lifecycle and Tenant Onboarding

## Architecture and invariants

Lifecycle, onboarding, Membership, User status, Platform authority, Tenant role and session state are independent. Platform routes authenticate the current User and revalidate `PlatformAuthority`; their `:id` is only the target Organization. Ordinary APIs still require an ACTIVE Membership in an ACTIVE Organization, so Platform Admin has no implicit business-data access.

The authoritative transitions are `PENDING_SETUP -> ACTIVE`, `ACTIVE -> SUSPENDED`, `SUSPENDED -> ACTIVE`, and `PENDING_SETUP|ACTIVE|SUSPENDED -> ARCHIVED`. Archive is terminal. Same-state commands are idempotent no-ops. Activation/resume require `READY` onboarding and at least one active `isTenantOwner` Membership whose User is active.

`isTenantOwner` was selected over global `UserRole.OWNER`, PlatformRole reuse, or a magic Organization because ownership belongs to one User/Organization relation. A separate ownership table would add lifecycle and join complexity without supporting a current requirement. Existing Organizations remain ACTIVE and receive no inferred Owner; explicit remediation is deferred because representative data provides no deterministic ownership evidence.

Provisioning uses an exact User UUID, server-owned target Organization ID, a transaction advisory lock and serializable transaction. It upserts only a Tenant-owned default Team and the intended Membership, does not overwrite an existing Team, does not set a default Membership, calls no global seed, and remains safe on repeated or partial runs. Audit and state mutation share the transaction. A failed transaction is followed by a bounded, redacted FAILED-state/audit attempt; valid data is retained for forward retry.

## Migration SQL review

- `ALTER TYPE ... ADD VALUE IF NOT EXISTS` takes a short enum catalog lock. PostgreSQL cannot remove an enum value without rebuilding the type, so schema rollback retains it. The new value is not consumed later in the same migration transaction.
- `CREATE TYPE` is catalog-only.
- `ALTER TABLE organizations ADD COLUMN` takes an ACCESS EXCLUSIVE DDL lock. PostgreSQL stores constant defaults without rewriting existing rows on supported versions; nullable timestamps/text add no backfill UPDATE.
- `ALTER TABLE organization_memberships ADD COLUMN ... DEFAULT false` is additive and performs no ownership inference or explicit UPDATE.
- The owner index scans Membership rows and briefly locks DDL; representative size is five rows. No unique/FK validation or table rewrite is added.
- Old code can ignore additive columns, but it does not recognize `PENDING_SETUP`; once new Tenants exist, an old image is not a safe universal rollback target.

## Non-Production validation

1. Verify backup checksums and `pg_restore --list`; restore PostgreSQL and MinIO into isolated volumes.
2. Compare Organization/User/Membership/Team/Audit/migration and MinIO counts. Run fix 000083 backfill only if the restored historical snapshot predates its operator backfill; require dry-run, confirmed apply, second no-op apply and validation.
3. Build the final runtime image. Run `tenant-onboarding:preflight` before migration, apply migrations with the isolated owner URL, then run `tenant-onboarding:validate`.
4. Verify existing Organization IDs/status/counts, Memberships and Teams are unchanged; no Owner or Platform Admin is auto-created.
5. Provision a disposable Tenant twice and after a simulated partial state; verify one Team, one Membership and one Owner assignment. Exercise every lifecycle/auth/session/tenant-isolation case.
6. Apply the complete chain to a separate empty disposable database and validate. Verify Notification ENABLE/FORCE RLS and runtime `NOSUPERUSER NOBYPASSRLS`.
7. Run Prisma checks, migration tooling, focused/full/coverage tests, lint, build, CI and `git diff --check`.

## Production deployment — operator runbook, do not execute from Codex

Production path is `/opt/CRM/iam-crm-backend`; Compose project is `iam-crm-backend`; API/DB are `iam-crm-backend-api-1` and `iam-crm-backend-db-1`. In interactive PuTTY blocks do not use `exit`, `exit 1`, `set -e`, or `set -euo pipefail`. On a failed gate print `echo "STOP: <reason>. Do not continue."` and stop manually.

1. Discover and record branch, HEAD, origin/main, working tree, service/image state, disk and migration status. Identify the exact approved 000089 SHA and inspect the complete incoming commit/migration/environment/operator range. Do not assume Production is one fix behind.
2. Preserve `.env`, `.env.docker`, Compose overrides and other server-only configuration. Confirm `DATABASE_URL -> iam_crm_runtime` and `MIGRATION_DATABASE_URL -> controlled owner`; never collapse them.
3. Snapshot/tag the current API image. Back up PostgreSQL and MinIO using the approved convention, checksum artifacts, restore PostgreSQL into isolated non-Production storage, verify MinIO separately, and compare migration rows plus Organization/status/User/Membership/Team/onboarding counts and object count/bytes. Until restore succeeds, do not start schema change.
4. Run only `git fetch origin main`, inspect the exact target, then `git switch main` and `git merge --ff-only <APPROVED_FIX_000089_SHA>`. Never use blind pull. Validate Compose and build only API.
5. From the new image run read-only onboarding and Platform-authority preflights. Enter maintenance, stop only API, keep DB/MinIO running, and apply migrations explicitly with `MIGRATION_DATABASE_URL`. Check migrate status; run onboarding and Platform validation. There is no automatic Owner backfill.
6. Verify the existing company has the same ID, remains ACTIVE and has unchanged Membership/business counts. Verify no Platform Admin or Owner was guessed; lifecycle/onboarding constraints are valid; Notification RLS is ENABLE/FORCE; runtime is NOSUPERUSER/NOBYPASSRLS.
7. Recreate only API with `docker compose --env-file .env.docker -p iam-crm-backend up -d --no-deps --force-recreate api`. Check services, logs, the actual health endpoint and both DB identities.

## Production smoke tests

With approved non-sensitive identities, verify existing-company password login, passkey where configured, refresh, current user, tenant switch, Companies, People, Opportunities, Tasks, Meetings and Notifications. Verify Platform Admin can create/provision/activate/suspend/resume/archive a test Tenant but Tenant ADMIN receives forbidden. Verify PENDING_SETUP/SUSPENDED/ARCHIVED business access, old access token, refresh and switch are denied; ACTIVE access succeeds; an active second Membership remains usable; Platform Admin without Membership cannot access Tenant business APIs; Owner authority is limited to its Organization; Notification isolation and every lifecycle audit event remain correct.

Stop if migration/validation/count/health/RLS fails, existing company stops being ACTIVE, Memberships change unexpectedly, lifecycle access is bypassed, active Tenant access breaks, Owner/Platform authority leaks, or provisioning duplicates data.

## Rollback

Prefer application rollback and retain additive schema/data. Never delete Tenants, onboarding records, Memberships or business data, and never use database restore routinely. If new `PENDING_SETUP` Tenants exist, quarantine their control-plane operations before selecting a pre-000089 image because old code may treat lifecycle semantics incorrectly. Recreate only the API from the tagged image, then repeat health/auth/Tenant/RLS checks. Database restore is incident recovery only after explicit review.
