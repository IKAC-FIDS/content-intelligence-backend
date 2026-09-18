# Local Windows Docker Desktop migration-safety runbook

This is the executable local workflow for fix 000081. Run it only from the IAM CRM backend repository on Windows with Docker Desktop using the local `desktop-linux` context. It must not be used with a remote Docker context or a Production endpoint.

## 1. Repository verification

```powershell
Get-Location
git branch --show-current
git rev-parse HEAD
git status --short
git log -5 --oneline
```

The branch must be `fix/000081-migration-safety-baseline`. Stop if the tree contains unexplained changes.

## 2. Local environment verification

```powershell
docker version
docker context show
docker context inspect
docker compose version
docker compose config --services
docker compose config --volumes
docker compose config --format json | ConvertFrom-Json | ForEach-Object { $_.networks.PSObject.Properties.Name }
docker compose ps
```

The expected discovered services in the current repository are `db`, `minio`, `minio-init`, and `api`; volumes are `iam_crm_db_data` and `minio_data`. Discovery remains authoritative. The safety CLI rejects non-local Docker endpoints, missing required services, and Production-like project names. It reads required container environment values internally and never prints passwords, access keys, secret keys, or complete database URLs.

Validate variable presence without displaying values:

```powershell
Get-ChildItem -Force -File -Filter '.env*' | ForEach-Object {
  Write-Output "[$($_.Name)]"
  Get-Content $_.FullName |
    Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=' } |
    ForEach-Object { ($_ -split '=', 2)[0].Trim() }
}
```

## 3. Repository quality checks

```powershell
npm ci
npx prisma format
npx prisma validate
npm run prisma:generate
npm test -- --runInBand test/migration-safety.spec.ts
npm test -- --runInBand
npm run lint
npm run build
npm run safety:scan-migrations > migration-safety-review.local.json
```

`migration-safety-review.local.json` is a local review artifact and must not be committed. Scanner findings require human review and do not prove safety or unsafety by themselves.

## 4. Compose and local data preservation

```powershell
docker compose config
docker compose config --services
docker compose config --volumes
docker compose ps --format json
docker compose images
docker volume ls
```

Record the Compose project, container IDs, image IDs, volumes, networks, and service state. Never use `docker compose down -v`, `docker volume rm`, Prisma reset, force-reset, or a restore over the development database.

## 5. Build and runtime smoke checks

```powershell
docker compose build api
docker compose up -d --no-deps --force-recreate api
docker compose ps
docker compose logs --tail=300 api
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:3000/api/ready
Invoke-RestMethod http://localhost:3000/api/version
```

The three endpoints above exist in `HealthController`. Authenticated checks require operator-supplied local test credentials and must not print or persist tokens. This tooling changes no API or CRM behavior.

## 6. Create and verify the safety baseline

Use a destination outside the repository. The default is the sibling directory `E:\nodejs\iam-crm-safety-artifacts` for the current checkout.

```powershell
.\scripts\migration-safety.ps1 backup -DryRun
.\scripts\migration-safety.ps1 backup -ArtifactRoot E:\nodejs\iam-crm-safety-artifacts
Get-ChildItem E:\nodejs\iam-crm-safety-artifacts
.\scripts\migration-safety.ps1 verify -Backup E:\nodejs\iam-crm-safety-artifacts\<backup-id>
```

Each run creates a unique directory without overwriting older artifacts. It checks free space, creates a PostgreSQL custom-format dump, verifies it with `pg_restore --list`, mirrors MinIO objects through `minio/mc --preserve` and inventories them through the object API, copies local deployment configuration without displaying contents, inventories every existing public table, records organizations and the sole primary-tenant candidate when unambiguous, reports null tenant columns, foreign-key orphans, duplicate unique-index candidates, invalid attachment metadata, and DB/MinIO object differences, scans migrations, calculates SHA-256 checksums for every artifact/object, and writes `manifest.json`.

The configuration backup contains secrets and must remain access-controlled outside Git. Checksums provide integrity, not encryption. The current Compose bucket is not versioned; if versioning is enabled later, preservation of all historical versions requires a reviewed tooling extension.

## 7. Isolated restore test

```powershell
.\scripts\migration-safety.ps1 restore-test `
  -Backup E:\nodejs\iam-crm-safety-artifacts\<backup-id> `
  -RestoreProject iam-crm-restore-test-<timestamp>
```

The command prints and validates source and target project, database, volume, and MinIO identities before creating anything. The restore project uses `tools/migration-safety/restore-compose.yml`, database `iam_crm_restore_test`, and separate named PostgreSQL and MinIO volumes. It verifies all checksums before restore, restores PostgreSQL, restores MinIO bytes, and writes a source-versus-restored report.

Inspect the report before cleanup. Cleanup is opt-in:

```powershell
.\scripts\migration-safety.ps1 restore-test `
  -Backup E:\nodejs\iam-crm-safety-artifacts\<backup-id> `
  -RestoreProject iam-crm-restore-test-<timestamp> `
  -Cleanup
```

The command prints and validates the exact disposable target containers and volumes before `docker compose down --volumes`. This destructive cleanup is permitted only for resources created under that unique restore-test project. Normal development volumes are never cleanup targets, and the source project name/volumes are rejected by the identity guard.

## 8. Git review and commit

```powershell
git status --short
git diff --check
git diff --stat
git diff
git status --short -- .env .env.docker prisma/schema.prisma prisma/migrations
git ls-files --stage
```

Confirm that no environment copy, dump, MinIO archive, manifest, local report, node_modules change, or unrelated generated output is staged. Do not push, merge, tag, release, or deploy automatically.

## Failure and rollback behavior

The source workflow is read-only. A failed backup is not a rollback point and must not be used. Retain its unique directory for diagnosis or remove it manually only after confirming its exact path is outside the repository. A failed isolated restore does not affect source data; preserve its report and logs, then stop only the uniquely named restore project. Application rollback is simply reverting the fix 000081 commit because this fix adds tooling/documentation only and introduces no schema or runtime behavior change.
