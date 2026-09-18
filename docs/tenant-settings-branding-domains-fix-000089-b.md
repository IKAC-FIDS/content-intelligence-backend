# fix 000089-B — Tenant Settings, Branding and Domains operator runbook

Documentation only. Codex did not execute these Production steps. Production path is `/opt/CRM/iam-crm-backend`, Compose project `iam-crm-backend`, API `iam-crm-backend-api-1`, DB `iam-crm-backend-db-1`. Stop manually whenever a gate fails; use `echo "STOP: <reason>. Do not continue."` and never use `exit`, `set -e`, or destructive database/volume commands.

## Approval, backup and isolated proof

1. Record `git rev-parse HEAD`, `git rev-parse origin/main`, branch, `git status --short`, approved fix SHA and complete `git log --oneline HEAD..<approved-sha>` / `git diff --stat HEAD..<approved-sha>` / migration SQL review. Preserve `.env`, `.env.docker`, Compose overrides and all server-local configuration. Confirm update is fast-forward-only to the exact reviewed SHA.
2. Record API image ID and add a unique rollback tag. Record disk space and `docker compose -p iam-crm-backend config`; do not recreate DB or MinIO.
3. Create a fresh logical PostgreSQL backup with the owner identity and a SHA-256 checksum. Restore it into a genuinely new isolated PostgreSQL database and require `pg_restore --exit-on-error` success. Record Organizations/statuses, Users, Memberships, Teams, settings, branding, domains, file metadata, audit count and migration count. Verify MinIO object count/checksums independently because branding references existing attachments; do not overwrite or delete objects.
4. Run the new image's `tenant-configuration:preflight -- --organization-id=<exact-existing-company-id>` against the isolated restore. Confirm duplicate codes/domain collisions are absent and target ID/timezone/locale match the baseline. Apply migrations using `MIGRATION_DATABASE_URL`, run dry-run backfill, confirmed backfill, second confirmed run (must report zero), then `tenant-configuration:validate`.
5. Compare all baseline counts and relationships; only one expected settings row/audit may be added by backfill. Existing Organization ID/status/timezone/locale, files/object keys, business data and authorities must be unchanged. Confirm no Tenant Owner or Platform Admin was inferred, Notification RLS is ENABLE/FORCE, and runtime role is `NOSUPERUSER`/`NOBYPASSRLS` with no-context Notification reads denied.

## Controlled deployment

1. Verify `DATABASE_URL` remains the restricted runtime identity and `MIGRATION_DATABASE_URL` remains the owner/migration identity. Fetch safely, review the incoming range again, and perform only an ff-only update to the approved SHA while preserving `.env.docker`.
2. Validate Compose and disk space. Build only the API image. Run Prisma validation/generation, migration inventory, fix preflight and validation in the new image before downtime.
3. Stop only `iam-crm-backend-api-1`. Apply `prisma migrate deploy` explicitly with `MIGRATION_DATABASE_URL`. Run exact-target settings backfill dry-run, operator-approved apply, second-run no-op and validation. Recheck Organization/settings/branding/domain/file/audit counts, legacy Organization ACTIVE/unchanged, authority counts, Notification RLS and runtime-role restrictions.
4. Recreate only the API. Inspect logs, call the actual `/api/health`, verify frontend proxy health, and perform authenticated settings/branding/domain smoke tests for the existing tenant and another tenant. Negative tests must prove guessed domain/attachment IDs and cross-Tenant operations fail. Verify image download authorization and DNS TXT verification without logging token material.

## Rollback

Prefer the tagged pre-000089-B API image while retaining additive tables. It remains compatible: it ignores settings/branding/domain rows and continues seeing dual-written legacy timezone/locale. Quarantine configuration changes during rollback because old code cannot enforce the new password/passkey policy or use verified-domain routing. Do not delete rows/assets and do not restore the database over newer valid data; database restore is incident recovery only. Re-enable the new image before relying on new security policies or domains. Future work: bootstrap-safe RLS, domain rotation/re-verification, dedicated branding upload UX and integration of verified domains with SSO discovery.
