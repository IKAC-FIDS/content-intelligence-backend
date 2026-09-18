# fix 000088 — Platform Administration Authority Model

## Authority and threat model

Platform authority is an application control-plane authority persisted in `platform_authorities`. It is orthogonal to `UserRole`, `Role`, `RolePermission`, `OrganizationMembership`, and `TenantContext`. The central guard verifies the signed identity, current User activity and current persisted assignment on every request. Request bodies, query parameters, Organization IDs, arbitrary headers and JWT role claims cannot grant authority.

This mitigates Tenant ADMIN cross-Organization escalation, forged claims/flags, stale access tokens, refresh-based privilege resurrection, Tenant-switch elevation, bootstrap HTTP backdoors, fake Tenant audit ownership and accidental RLS bypass. A Platform Admin still needs an active Membership for Tenant business APIs; a suspended Tenant remains unusable even when its user also has Platform authority.

## Endpoint matrix

| Endpoint | Previous authorization | Correct scope | fix 000088 action |
| --- | --- | --- | --- |
| `GET /api/organizations/current` | JWT + `organization:view` | Tenant | unchanged |
| `GET /api/admin/organizations` | JWT + `organization:manage` + legacy ADMIN service check | Platform | `PlatformAdminGuard` |
| `POST /api/admin/organizations` | same | Platform | `PlatformAdminGuard` |
| `GET /api/admin/organizations/:id` | same | Platform | `PlatformAdminGuard` |
| `PATCH /api/admin/organizations/:id` | same | Platform | `PlatformAdminGuard` |
| `PATCH /api/admin/organizations/:id/activate` | same | Platform | `PlatformAdminGuard` |
| `PATCH /api/admin/organizations/:id/suspend` | same | Platform | `PlatformAdminGuard` |

No unrelated admin route is reclassified. Organization lifecycle redesign and Tenant onboarding remain fix 000089.

## Persistence, session and audit behavior

`PlatformAuthority` is one-to-one with User and currently supports only `PLATFORM_ADMIN`. Uniqueness makes concurrent grants converge; transactions make authority/audit changes atomic. Grant/revoke do not touch Tenant roles, memberships, sessions or business data. Zero assignments is an allowed recoverable state; there is no hidden last admin.

Platform access JWTs contain no trusted Platform role. Platform-only refresh tokens use a versioned scope marker, not authority; refresh checks the assignment again. Revocation is effective at the next protected request and next refresh. Existing tenant-bound and legacy refresh tokens remain compatible. Password, passkey and SSO converge on the same User-level persisted check.

Platform audits use nullable `organizationId`; the audit service now distinguishes explicit null from an omitted Organization so request Tenant context cannot be copied into a Platform event. CLI events use a null actor because they are operator actions and include only target User ID, role and non-secret source metadata.

## Operator commands

Run from the built image/runtime with the controlled database URL. Preflight and validate are read-only. Grant and revoke require the exact immutable User ID and confirmation.

```text
npm run platform-admin:preflight -- --user-id <USER_UUID>
npm run platform-admin:grant -- --user-id <USER_UUID> --confirm-apply
npm run platform-admin:validate
npm run platform-admin:revoke -- --user-id <USER_UUID> --confirm-apply
```

Never infer the first Platform Admin from Tenant ADMIN, the first/oldest User, an email constant or an Organization. Record separate operator approval before the first grant.

## Migration review

The migration creates an enum and an empty table, then an empty unique index, a small role index and a User FK. It does not alter or rewrite `users`, assign existing rows, backfill ownership or touch Tenant/business tables. DDL takes catalog locks; empty index construction has negligible local work. The FK references the existing User primary key and the table is empty at validation. Prisma migration execution is transactional on PostgreSQL, so failure rolls back the migration. The schema rollback boundary is additive: leave the table in place. Dropping it or the enum is destructive and is not a routine rollback.

## Non-Production validation procedure

1. Run migration-safety backup dry-run, backup, checksum verification and `pg_restore --list`.
2. Restore into an isolated project/database/volume and compare every table plus MinIO inventory.
3. Run Platform preflight from the new runtime image; before migration it must report `tableExists=false` without writing.
4. Apply migrations with the owner URL, then validate zero automatic authorities.
5. On the isolated restore only, grant twice and revoke twice; expect `granted`, `unchanged`, `revoked`, `unchanged` and exactly one audit event per state change.
6. Compare User, Organization, Membership and business counts; verify Notification ENABLE/FORCE RLS.
7. Apply the complete migration history to a separate empty PostgreSQL database and verify zero authority rows.
8. Run targeted tests, full tests, lint, build and CI. Do not clean up volumes automatically; use only a separately reviewed exact cleanup action.

## Production deployment runbook — operator-led, do not execute here

Production path is `/opt/CRM/iam-crm-backend`, Compose project `iam-crm-backend`, API container `iam-crm-backend-api-1`, and DB container `iam-crm-backend-db-1`. The operator must discover actual values first. Interactive PuTTY commands must not use `exit`, `exit 1`, `set -e`, or `set -euo pipefail`; on a blocker print `echo "STOP: <reason>. Do not continue."` and stop manually.

1. Discover branch, HEAD, `origin/main`, working tree, services/containers/images, disk and migration status. Confirm the approved fix SHA and inspect every commit, migration, operator command and environment change from current Production HEAD through it.
2. Preserve `.env`, `.env.docker`, `docker-compose.override.yml` and deployment-only files. Never restore them from Git. Confirm `DATABASE_URL` is the restricted `iam_crm_runtime` and `MIGRATION_DATABASE_URL` is the controlled owner; never collapse them.
3. Tag the current API image for rollback. Back up PostgreSQL and MinIO with approved tooling, checksum every artifact, restore PostgreSQL to an isolated non-Production container/volume, verify MinIO separately and compare representative counts. Until restore succeeds, do not start schema change.
4. `git fetch origin main`, verify target containment and exact SHA, then `git switch main` and `git merge --ff-only <APPROVED_FIX_000088_SHA>`. Do not use blind pull.
5. Validate Compose with `docker compose --env-file .env.docker -p iam-crm-backend config`, then build only API with `docker compose --env-file .env.docker -p iam-crm-backend build api`.
6. From the new image run read-only `platform-admin:preflight`. Stop only API writes; keep DB and MinIO up. Apply reviewed migrations explicitly with `MIGRATION_DATABASE_URL`; check migration status and run `platform-admin:validate`.
7. Verify `notifications` remains ENABLE/FORCE RLS and the runtime role is `NOSUPERUSER NOBYPASSRLS`. No Platform HTTP path may use owner credentials.
8. Recreate only API: `docker compose --env-file .env.docker -p iam-crm-backend up -d --no-deps --force-recreate api`. Check Compose status, logs, repository health endpoint, startup migration status and runtime DB identity.
9. Deployment completion does not grant an admin. Initial bootstrap is a separate approved operator step: identify the exact active User UUID, review uniqueness/status and approval, run preflight, confirmed grant and validate. Never auto-promote Tenant ADMIN.

## Production smoke tests — operator-led

- Unauthenticated and ordinary callers: Platform routes denied.
- Tenant ADMIN: normal Tenant administration remains functional; all Platform Organization routes denied.
- Platform Admin, including one without membership in the target Tenant: Platform Organization routes allowed; target Tenant Companies/Opportunities/Tasks/Meetings/Notifications remain inaccessible without Membership.
- Revoke the test authority only when approved: old access token and refresh must be denied on Platform routes; Tenant access remains governed by Membership.
- Verify login, refresh, current-user compatibility, Tenant switch, password/passkey paths, permissions, Organization control plane, Companies, Opportunities, Tasks, Meetings and Notifications.
- Confirm Tenant isolation, Notification no-context RLS failure and Platform audit attribution.

Stop and roll back the application if migration validation, login/refresh, authority denial, revocation, Tenant isolation, RLS, Tenant APIs or health checks fail.

## Rollback

Application rollback comes first and the additive schema remains. Do not restore an old database over newer valid data or delete assignments as routine rollback. Rolling back to code where Tenant ADMIN can perform cross-Organization operations is a security rollback requiring incident-level approval. If the prior image is selected, use the tagged image, recreate only API, re-run health/auth/Tenant/RLS checks and retain Platform audit/table data for forward recovery. Database restore is incident recovery only.
