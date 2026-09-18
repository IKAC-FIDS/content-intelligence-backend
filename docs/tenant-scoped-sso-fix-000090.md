# fix 000090 — Tenant-scoped SSO Providers

## Security and data model

`SsoProvider.organizationId` is the ownership discriminator. It remains nullable only for expand-and-contract rollout; runtime services reject null ownership. Provider name/type, issuer, client ID and entity ID use Tenant-aware uniqueness. `SsoProviderRoute` provides exact, case-normalized, globally unambiguous DOMAIN/SUBDOMAIN pre-auth routing. `SsoGroupRoleMapping` is an explicit allowlist to active internal Roles. `SsoAuthTransaction` stores only hashed state plus encrypted nonce/PKCE verifier and is atomically one-time consumed.

New Providers derive Organization only from authenticated `TenantContext`. Existing rows are assigned only by the confirmed operator tool. Existing allowed domains become exact DOMAIN routes. No User role, Tenant Owner, Platform authority or default Membership is inferred.

The migration takes short ACCESS EXCLUSIVE locks while adding nullable columns and creating empty tables/FKs. Constant/catalog work does not rewrite Provider rows. Unique indexes scan existing Provider rows, but nullable ownership means legacy rows cannot conflict until preflight-approved backfill. Routing/mapping/transaction indexes are initially empty. There is no UPDATE, destructive DDL or automatic backfill. Routine rollback retains all additive schema.

## Operator commands

Run from the final compiled image with the controlled database identity:

```text
npm run sso-tenant:preflight -- --organization-id <EXACT_ORGANIZATION_UUID>
npm run sso-tenant:backfill:dry-run -- --organization-id <EXACT_ORGANIZATION_UUID>
npm run sso-tenant:backfill -- --organization-id <EXACT_ORGANIZATION_UUID> --confirm-apply
npm run sso-tenant:backfill -- --organization-id <EXACT_ORGANIZATION_UUID> --confirm-apply
npm run sso-tenant:validate -- --organization-id <EXACT_ORGANIZATION_UUID>
```

The second apply must report zero updates/routes. Stop if the target is missing/non-ACTIVE, any proposed uniqueness/routing collision exists, identities are orphaned, or secret format is incompatible.

## Production deployment — documentation only

Production reference: `/opt/CRM/iam-crm-backend`, project `iam-crm-backend`, API `iam-crm-backend-api-1`, DB `iam-crm-backend-db-1`. Interactive PuTTY blocks must not use `exit`, `exit 1`, `set -e`, or `set -euo pipefail`. On failure print `echo "STOP: <reason>. Do not continue."` and stop manually.

1. Record branch/HEAD/origin/main/status, services, exact images, disk and migration state. Verify the approved 000090 SHA and inspect every incoming commit, migration, environment change and operator command from Production HEAD.
2. Preserve `.env.docker`, `.env`, Compose overrides and all server-only files. Verify `DATABASE_URL` is restricted runtime and `MIGRATION_DATABASE_URL` is controlled owner.
3. Tag the current API image. Create a fresh PostgreSQL backup and checksum. Restore it into genuinely isolated non-Production storage and compare Organizations/statuses, Users, Memberships, Teams, Providers, ExternalIdentities, refresh sessions, migrations and relevant MinIO counts. No certificate/file storage is introduced by this fix; retain the normal MinIO verification.
4. Run the exact Provider preflight against the restore. Confirm the intended existing-company Organization ID from approved records, not a first-row/default guess. Test migration, dry-run, confirmed backfill, second no-op backfill and validation on the restore before Production schema work.
5. Use `git fetch origin main`, inspect the exact target, `git switch main`, then `git merge --ff-only <APPROVED_FIX_000090_SHA>`. Never use blind pull. Validate Compose, disk, and build only API.
6. Run new-image read-only preflight. Stop only API; keep DB and MinIO running. Apply reviewed migrations explicitly with `MIGRATION_DATABASE_URL`, check migrate status, repeat preflight, dry-run, operator-approved confirmed backfill, second no-op apply and validation.
7. Compare Provider/identity/config/Organization/User/Membership/Team/session counts and Provider IDs. Verify existing Organization ACTIVE, no inferred Owner/Platform Admin, Notification ENABLE/FORCE, and runtime `NOSUPERUSER NOBYPASSRLS`.
8. Recreate only API. Check Compose status/logs and actual `/api/health`. Smoke-test exact-domain discovery, Tenant A/B CRUD denial, OIDC state/nonce/PKCE and replay rejection, SAML RelayState/InResponseTo, existing-company login, suspended Organization/Membership, ticket exchange, group mapping, secret-free responses and sanitized test-connection.

Stop for migration/backfill/validation/count failures, Provider ID/config changes, cross-Tenant disclosure, replay acceptance, privilege escalation, RLS/runtime-role regression or health/auth failure.

## Rollback

Prefer application rollback and retain additive schema. After backfill, pre-000090 code is unsafe because it globally lists tenant-owned Providers and accepts Provider IDs without tenant routing/state binding. Quarantine all SSO endpoints before running an old image; do not merely restart old code. Restore the tagged image only under that quarantine, verify password/passkey access and RLS, and forward-fix promptly. Database restore is incident recovery only. Provider rows, routes, identities and memberships must not be deleted as routine rollback.

## Deferred work

After all environments validate zero null ownership, a later migration may add NOT NULL. Provider-table RLS requires a separately reviewed pre-auth routing/callback bootstrap policy and runtime pool tests. External secret-manager references, certificate rotation/versioning and distributed cleanup of expired auth transactions are also deferred.
