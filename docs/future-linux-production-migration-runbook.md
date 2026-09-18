# FUTURE LINUX PRODUCTION RUNBOOK — DO NOT EXECUTE NOW

This document is for a later, operator-led Production session. It was not executed while implementing fix 000081. Codex must not connect to the server, use SSH/SCP, access Production credentials, or run these commands now.

Known future context, to be revalidated by the operator:

- Repository path: `/opt/CRM/iam-crm-backend`
- Compose project: `iam-crm-backend`
- Expected API container: `iam-crm-backend-api-1`
- Expected database container: `iam-crm-backend-db-1`

Discovery is authoritative; stop if actual identities differ or are ambiguous.

## Pre-deployment evidence

Record the current commit/branch, working tree, service and container state, image IDs, network and volume names, migration status, disk space, and an explicit application rollback image/commit:

```bash
cd /opt/CRM/iam-crm-backend
git branch --show-current
git rev-parse HEAD
git status --short
git log -5 --oneline
docker context show
docker compose --env-file .env.docker -p iam-crm-backend config --services
docker compose --env-file .env.docker -p iam-crm-backend config --volumes
docker compose --env-file .env.docker -p iam-crm-backend ps
docker compose --env-file .env.docker -p iam-crm-backend images
docker volume ls
df -h
docker compose --env-file .env.docker -p iam-crm-backend exec -T api npx prisma migrate status
```

Do not print `.env`, `.env.docker`, resolved secret values, credentials, or full database URLs. Do not use `git restore` or `git checkout` to replace deployment environment files.

## Required backup gate

Before any future migration, backfill, file, or storage-affecting change, use the reviewed safety tooling to create a unique backup outside the checkout, verify checksums and `pg_restore --list`, inventory MinIO, and execute a restore against an isolated non-Production target. Back up `.env`, `.env.docker`, Compose overrides, and deployment-only configuration without displaying contents.

```bash
./scripts/migration-safety.sh backup --dry-run --artifact-root /var/backups/iam-crm
./scripts/migration-safety.sh backup --artifact-root /var/backups/iam-crm
./scripts/migration-safety.sh verify --backup /var/backups/iam-crm/<backup-id>
./scripts/migration-safety.sh restore-test --backup /var/backups/iam-crm/<backup-id> --restore-project iam-crm-restore-test-<timestamp>
```

The current safety CLI intentionally accepts only local Docker socket contexts and rejects Production-like identities. Therefore, Production execution requires a separately reviewed operator override/change to the safety policy; do not weaken it ad hoc. Until that review exists, perform the equivalent operator-approved backup procedure and record the same manifest fields. This is a deliberate fail-closed limitation.

## Review incoming changes

Fetch without discarding local deployment configuration. Inspect the commit range, Prisma schema diff, every incoming `migration.sql`, backfill, Dockerfile, Compose change, and dependency change. Run the migration scanner, but treat its output only as a human-review aid. Confirm duplicate and orphan preflights before new unique or foreign-key constraints and estimate locks/table rewrites for large tables.

Validate the database host/name, Compose project, persistent volumes, backup directory, checksums, restore-test report, and available space without exposing secrets. Stop on any ambiguity or mismatch.

## Build and migration

```bash
docker compose --env-file .env.docker -p iam-crm-backend config
docker compose --env-file .env.docker -p iam-crm-backend build api
```

When reviewed migrations exist, prefer an explicit one-off migration step before recreating the API. Never run reset, force-reset, `down -v`, volume removal, `DROP DATABASE`, `DROP SCHEMA`, destructive unscoped SQL, or restore a backup over a valid database. Never recreate the database service for a normal application fix.

For fix 000081 specifically, no Prisma migration exists and no database step is required.

## API-only rollout and validation

```bash
docker compose --env-file .env.docker -p iam-crm-backend up -d --no-deps --force-recreate api
docker compose --env-file .env.docker -p iam-crm-backend ps
docker compose --env-file .env.docker -p iam-crm-backend logs --tail=300 api
curl --fail http://127.0.0.1:3000/api/health
curl --fail http://127.0.0.1:3000/api/ready
curl --fail http://127.0.0.1:3000/api/version
```

Run authenticated smoke tests only with operator-controlled credentials and without logging tokens. Validate login, permissions, organization isolation, background jobs, attachment access, frontend compatibility, and fix-specific behavior.

## Stop and rollback criteria

Stop when migration validation, counts, relationships, login, permissions, organization isolation, background processing, file access, API compatibility, readiness, or smoke tests fail.

Roll back the application image/code first while retaining any valid additive schema. Do not restore an older database over newer valid data without a separately approved incident procedure that accounts for writes after the backup. Fix 000081 is tooling-only, so its application rollback is reverting its commit/image; backup artifacts remain usable evidence and no database rollback is required.
