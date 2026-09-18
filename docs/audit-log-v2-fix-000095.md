# Fix 000095 — Audit Log V2

## Design

Fix95 expands `audit_logs`; it never replaces or destructively rewrites it. A V2 record adds scope, actor type, exact trusted Membership, source, result, duration and error code to the legacy Tenant/actor/request/entity/action/before/after/IP/User-Agent/metadata contract. `TENANT` requires an Organization and trusted TenantContext; `PLATFORM` uses PlatformAdmin authority and never implies Tenant membership; `SYSTEM` covers non-HTTP work. Anonymous auth attempts may have no user. Request IDs are reused from request context and never fabricated for jobs.

Existing action strings remain valid. New taxonomy is namespaced (for example `auth.login.success`, `auth.login.failed`, `platform.subscription.updated`). Before/after contain only material safe state. The central typed service validates scope and non-negative millisecond duration; recursively redacts password/hash/token/secret/authorization/cookie/credential/session/private-key keys; limits nesting to 6, arrays/object keys to 100, strings to 4,000, User-Agent to 512 and error code to 120. It never stores request bodies, credentials, file content, bucket or object key.

MUST-AUDIT covers security/commercial mutations already transactionally audited, authentication outcomes, credential/permission changes and successful protected downloads. Download fails if its audit write fails. Selected domain denials are recorded; routine duplicate 401/403 interception is deferred to avoid attack-driven log amplification.

Tenant API remains `/api/admin/audit-logs`, requires `audit-log:view`, and is always constrained to trusted Organization plus `TENANT`. `/api/admin/platform-audit-logs` is separate and guarded by `PlatformAdminGuard`. Explicit bounded filters cover date, actor, membership, request, entity, action/prefix, source, result, IP and Platform target Organization. Sort is only `createdAt`/`durationMs`; pagination is bounded. CSV/JSON and compatible XLSX exports are capped (5,000 with payload; maximum 50,000 compact), formula-safe, UTC, sanitized and self-auditing. Fix94 discovers both controllers; no route moved to `/v1`.

## Migration, retention, archive, RLS and rollback

`20260814120000_audit_log_v2` is additive: four enums, seven nullable columns, query indexes, archive and retention tables. The separately confirmation-gated, idempotent backfill classifies only deterministic legacy facts: Organization rows become Tenant, null-Organization rows System, actor presence USER/LEGACY, origin/result LEGACY. Duration and Membership remain null. Soft references preserve history after entity/user/member lifecycle changes. Indexes serve scope/time, Organization/scope/time, actor/time, membership/time, action/time and source/result/time; no unbounded JSON search was added.

Retention is a dedicated disabled/unconfigured policy with no invented commercial days. It reports `RETENTION_POLICY_REQUIRES_APPROVAL` and deletes zero rows. Legal hold and destructive purge are deferred. Archive uses PostgreSQL—not MinIO—is idempotent by original ID, batch-tagged, checksummed, count-verified, confirmation-gated and copy-only; source deletion is always zero and attachment objects remain untouched.

RLS is deferred because Platform cross-Tenant and maintenance identities need a separately proven policy. Central APIs fail closed meanwhile. Notification RLS and runtime roles are unchanged and must regress. Roll back the application image while retaining additive schema; never drop V2 data or restore an old DB over newer audit history. The old app can write legacy columns, but bypassing V2 MUST-AUDIT classification is an explicit rollback security risk.

After build: `audit-v2:preflight`, `audit-v2:backfill:dry-run`, `audit-v2:backfill`, `audit-v2:validate`, `audit-v2:archive:dry-run -- --cutoff=<UTC-ISO>`, `audit-v2:archive -- --cutoff=<UTC-ISO>`, and `audit-v2:retention:dry-run`. Apply requires `--confirm-apply`; second backfill/archive apply must be a no-op.

## Production runbook (documentation only)

Path `/opt/CRM/iam-crm-backend`; Compose `iam-crm-backend`; API `iam-crm-backend-api-1`; DB `iam-crm-backend-db-1`. PuTTY commands must never include `exit`, `exit 1`, `set -e`, or `set -euo pipefail`. On failure: `echo "STOP: <reason>. Do not continue."`

Do not begin schema changes until the test restore has succeeded.

«تا وقتی Restore آزمایشی موفق نشده، تغییر Schema را شروع نمی‌کنیم.»

1. Record current HEAD and origin/main.
2. Record the exact reviewed Fix95 SHA.
3. Review incoming commit range.
4. Review incoming files.
5. Locate/checksum migration.
6. Review migration SQL.
7. Review package scripts.
8. Review maintenance confirmation gates.
9. Capture service health.
10. Capture running API image.
11. Preserve immutable rollback image.
12. Back up/checksum deployment config.
13. Create fresh PostgreSQL backup.
14. Verify backup checksum.
15. Restore to clean isolated PostgreSQL with zero errors; `pg_restore --list` is insufficient.
16. Capture baseline migration count.
17. Capture baseline business counts.
18. Capture baseline audit counts.
19. Run Fix90–94 baseline regressions.
20. Verify disk space.
21. Validate Compose.
22. Update source fast-forward only.
23. Build only API image.
24. Migrate isolated restore.
25. Run preflight.
26. Run backfill dry-run.
27. Apply confirmed backfill.
28. Apply again; require no-op.
29. Validate Audit V2.
30. Run search smoke.
31. Run export smoke/self-audit.
32. Run archive dry-run only.
33. Run retention dry-run only.
34. Compare audit/business counts.
35. Verify Notification RLS.
36. Verify runtime role/NOBYPASSRLS.
37. Run OpenAPI generate/validate/contract/breaking.
38. Stop only API; not DB/MinIO.
39. Apply Production migration.
40. Run Production preflight.
41. Run Production backfill dry-run.
42. Require human evidence review.
43. Apply Production backfill.
44. Apply again; require no-op.
45. Validate Production Audit V2.
46. Production archive dry-run only.
47. Production retention dry-run only.
48. Compare Production counts.
49. Recreate only API.
50. Inspect sanitized logs.
51. Verify backend health.
52. Verify frontend proxy health.
53. Smoke login success/failure.
54. Smoke one authorized download/exactly one audit.
55. Smoke Tenant audit search.
56. Smoke Platform audit.
57. Smoke cross-Tenant denial.
58. Smoke bounded CSV/JSON export.
59. Final OpenAPI check.
60. Record final Git/migration/image/count state and approval.

Deferred: approved retention values, legal hold, deletion, Audit RLS, object archive, global denial interception and new metrics infrastructure.

## Validation evidence

`npm ci`, Prisma format/validate/generate, build, lint (zero errors; seven pre-existing warnings), migration safety scan, the 459-test configured suite (nine configured skips), 26 focused Audit/Tenant/JWT/attachment tests, 13 OpenAPI contract tests, Fix94 baseline breaking check, and `npm run ci` passed. Coverage passed at 34.90% statements, 31.52% branches, 30.93% functions and 36.52% lines. A disposable clean PostgreSQL 16 instance applied all 52 migrations. A synthetic legacy audit row produced dry-run=1, apply=1, second apply=0, validation success; archive produced copy=1, second copy=0 and final live/archive counts 1/1. Retention reported `RETENTION_POLICY_REQUIRES_APPROVAL` with zero deletion. Docker image `iam-crm-backend:fix-000095-local` built as `sha256:dd6f90559ea657b84161b31f8e5ec1bb914ee6c97dba758611f0396338381d88`.

No representative non-Production backup was present, so no representative restore is claimed. The clean isolated migration/backfill test is not a substitute for the mandatory Production-runbook restore gate. Notification RLS/runtime-role behavior was covered by the configured regression suite; no Production database or environment was accessed.
