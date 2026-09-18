# fix 000093 — Quota and Usage Metering

## Contract and architecture

The dependency is fix 000092. Runtime order is authentication → active Membership/TenantContext → RBAC → Feature entitlement → quota availability → business operation. Quota never grants permission or a Feature. PlatformAuthority controls configuration without tenant membership and grants no business-data read.

The stable metrics are `ACTIVE_USERS`, `COMPANIES`, `OPPORTUNITIES`, `FILES`, `STORAGE_BYTES`, `API_CALLS`, `WORKFLOW_RUNS`, `WEBHOOK_DELIVERIES`, `EMAIL_SENDS`, and `AI_REQUESTS`. `PlanQuota` is the baseline; one nullable `OrganizationQuotaOverride` per metric supplies inheritance/override. An enabled finite Plan row requires a hard limit. Explicit `isUnlimited` is distinct from missing configuration. Resolution is active Organization, effective active Subscription/Plan, Plan baseline, Tenant override, UTC period, then tenant-scoped counter. Fix92 `entitlementVersion` invalidates commercial configuration; RBAC `authorizationVersion` is untouched.

Soft limit is observable and non-blocking. Hard limit admits only when committed usage plus live reservations plus the requested positive amount does not exceed it. Hard-limit failure is HTTP 429 using the existing envelope with code `QUOTA_EXCEEDED` and safe metric/current/requested/limit/reset details. Threshold 80 and 90 records use hard-limit percentage and are unique per Organization+metric+period+threshold; audit is emitted only for a newly inserted threshold. Violations are audited. No email/webhook notification is invented.

All usage rows are Organization-scoped. Advisory transaction locks use `quota:<organizationId>:<metric>` and explicitly cast `pg_advisory_xact_lock(...)` to text for Prisma. Reservations prevent concurrent creates/uploads from both passing. Multi-metric upload commits are one transaction with sorted locks. Event keys are unique per Organization+metric and `createMany(skipDuplicates)` prevents retry double counting. Expired reservations are excluded during each security check even if scheduler is delayed.

Periods are UTC: `NONE` uses the Unix epoch/lifetime; `DAILY` uses UTC midnight; `MONTHLY` uses UTC month boundaries; `SUBSCRIPTION_TERM` uses stored UTC Subscription boundaries. Enforcement chooses the current period directly and never waits for cron. The scheduler expires reservations and appends at most 500 missing closed-period snapshots per pass; uniqueness makes a duplicate pass a no-op. Snapshots preserve final usage, limits, percentage and exceeded state.

Inventory definitions are authoritative: ACTIVE_USERS = active User joined through active Membership in that Organization; PlatformAdmin alone is not counted. COMPANIES exclude `archivedAt`; OPPORTUNITIES exclude their own `archivedAt` and those under an archived Company. FILES and STORAGE_BYTES exclude `deletedAt`, with bytes summed from persisted `FileAttachment.sizeBytes`. Create/restore/upload paths reserve quota; archive/delete synchronizes counters. Reconciliation compares and explicitly repairs drift. Event metrics begin at deployment because historical values are unavailable. Workflow/webhook/email/AI consumption is accepted-provider/logical-action semantics with a stable idempotency key, but no call site is connected until those subsystems exist. API_CALLS counts authenticated Tenant requests after guards, including later business failures, but excludes health, no-Tenant/unauthenticated, Platform-only and maintenance traffic. V1 makes one durable write per counted API request; this is correctness-first and is a known scaling cost.

Uploads reserve FILES and STORAGE_BYTES before object storage. Storage failure releases both. DB failure deletes only the new object and releases both. Existing objects are never deleted because quota is exceeded or the Organization is suspended. A process crash between object write and DB create can leave a new orphan; object inventory/reaper work remains an operational follow-up. MinIO is otherwise unchanged.

Legacy Organizations with no Subscription and subscriptions with no configured quota remain metered but enforcement is disabled and API state is `LEGACY_COMPATIBILITY` or `UNCONFIGURED`. This avoids rollout blocking without silently assigning commercial unlimited rights. Structural Plan rows are disabled, have no limits, and report `QUOTA_MATRIX_REQUIRES_COMMERCIAL_APPROVAL` until Product/Commercial supplies the matrix.

Tenant endpoint: `GET /api/quota/current`. Platform endpoints: `GET|PUT /api/admin/plans/:planId/quotas[/:metric]` and `GET|PUT|DELETE /api/admin/organizations/:organizationId/quotas[/:metric]`. Tenant routes derive Organization only from trusted TenantContext. Platform routes use PlatformAdminGuard. BigInt values are serialized as strings.

RLS is deferred for the new tables because configuration needs explicit cross-Tenant Platform access and internal counter writes need a separately reviewed transaction-local policy. Tenant read and write paths are centralized and exact-Organization scoped; there is no arbitrary tenant ID on tenant APIs. Notification RLS remains ENABLE/FORCE. Future RLS must retain runtime `NOSUPERUSER/NOBYPASSRLS` and migration/Platform identities.

## Maintenance commands

```text
npm run quota:preflight -- --organization <EXACT_ORGANIZATION_UUID>
npm run quota:bootstrap:dry-run
npm run quota:bootstrap
npm run quota:backfill:dry-run -- --organization <EXACT_ORGANIZATION_UUID>
npm run quota:backfill -- --organization <EXACT_ORGANIZATION_UUID>
npm run quota:backfill -- --organization <EXACT_ORGANIZATION_UUID>
npm run quota:reconcile:dry-run -- --organization <EXACT_ORGANIZATION_UUID>
npm run quota:reconcile -- --organization <EXACT_ORGANIZATION_UUID>
npm run quota:validate -- --organization <EXACT_ORGANIZATION_UUID>
```

Bootstrap is structural and idempotent; no seed and no limit guess. Backfill/reconcile is exact-Organization, bounded to five inventory metrics, dry-run-first, rerunnable, never changes business rows, ownership, subscription or entitlement. Event history reports `START_FROM_DEPLOYMENT`.

## Migration SQL review

The additive migration creates three enums and seven empty tables. Unique indexes enforce Plan+metric, Organization+metric, Organization+metric+period, append-only snapshot period, once-per-threshold, reservation key and event key. Supporting indexes lead with Organization and metric/status/time. All eight FKs use RESTRICT; no usage cascade can delete business history. CHECK constraints require non-negative limits/usage, positive reservation/event amounts, soft <= hard, valid periods, explicit unlimited rows without limits, and thresholds 80/90. There is no UPDATE, DELETE, data backfill, DROP, TRUNCATE or schema rewrite. New-table index builds do not scan business tables. Enum/type/table creation and catalog locks are transactional; routine rollback retains additive schema/history because dropping enums/tables is not safe. Existing applications ignore these tables.

## Production operator runbook — documentation only

Production path `/opt/CRM/iam-crm-backend`; Compose project `iam-crm-backend`; API `iam-crm-backend-api-1`; DB `iam-crm-backend-db-1`. PuTTY commands must never contain `exit`, `exit 1`, `set -e`, or `set -euo pipefail`. On failure print `echo "STOP: <reason>. Do not continue."` and stop manually.

1. Record current `HEAD`, `origin/main`, exact approved Fix93 SHA, complete incoming range and incoming files.
2. Review migration SQL and maintenance implementation line-by-line against the approved SHA.
3. Record service health, running API image digest and an immutable rollback image tag.
4. Back up deployment config and environment files without printing secrets.
5. Create a fresh PostgreSQL custom-format backup and SHA256 checksum; verify the checksum.
6. **Do not begin schema changes until the test restore has succeeded.** `pg_restore --list` alone is not verification.
7. Restore to a genuinely clean isolated PostgreSQL instance and require zero restore errors.
8. Record baseline Organizations, Users, active Memberships, Companies, Opportunities, active Files and storage-byte sums.
9. Record Fix92 Plans, Features, Subscriptions, Entitlement overrides and entitlement versions.
10. Record quota baseline, disk availability, migration status and Notification RLS/runtime-role attributes.
11. Validate Compose configuration and ensure only the API image is scheduled to build/change.
12. Fetch and inspect; update source ff-only to the exact approved SHA. Do not merge, force, tag or edit Production env files.
13. Build only API and record the candidate image digest; do not recreate API yet.
14. Apply Fix93 migration first on the isolated restore and confirm the complete migration list.
15. Run quota preflight on the restore and retain JSON output.
16. Run bootstrap dry-run; stop if it proposes non-structural limits.
17. Run bootstrap apply, then repeat and require `created: 0`.
18. Configure only a separately approved commercial quota matrix through Platform control plane.
19. For each exact Organization run initial usage backfill dry-run and compare authoritative counts.
20. Apply exact-Organization backfill, repeat it, and require no changed inventory on the second run.
21. Run validate and reconciliation dry-run; investigate every non-zero delta.
22. Verify snapshots/events are empty unless deliberately exercised and no historical event usage was fabricated.
23. Verify business data, Fix92 commercial state, RBAC, SSO and PlatformAuthority baselines are unchanged.
24. Verify Notification RLS remains ENABLE/FORCE and runtime role remains restricted (`NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`).
25. Exercise isolated authenticated quota read, Platform update, Tenant mutation denial and cross-Tenant negatives.
26. Exercise isolated hard-limit, exact-limit, one-over, concurrent create/upload and idempotent retry tests.
27. Confirm API health/no-Tenant exclusions and UTC rollover with delayed scheduler.
28. This fix measures persisted metadata and does not mutate existing MinIO objects; do not restart/recreate MinIO and no fix-specific object backup is required beyond normal policy.
29. Stop only Production API after every restore gate passes; leave DB and MinIO running.
30. Apply migrations with migration identity and confirm Fix93 exactly once.
31. Run Production quota preflight and compare with restore baseline.
32. Run Production bootstrap dry-run; require only missing disabled structural rows.
33. Apply bootstrap only after review, then repeat and require no-op.
34. Configure only approved limits; keep unapproved metrics disabled/unconfigured.
35. Run exact-Organization usage backfill dry-run and obtain human approval of counts.
36. Apply backfill per exact Organization, repeat and require no changed usage.
37. Run validate and reconciliation dry-run; do not silently repair unexplained drift.
38. Recompare all business and Fix92 commercial counts; quota work must not mutate them.
39. Reverify Notification RLS/runtime role and database grants.
40. Recreate only API with `docker compose --env-file .env.docker -p iam-crm-backend up -d --no-deps --force-recreate api`.
41. Inspect API status and logs for migration, quota, serialization, lock and counter failures.
42. Check actual backend `/api/health` and frontend proxy health.
43. Run authenticated tenant quota-summary smoke and verify bounded string-valued counters/limits.
44. Run a safe hard-limit negative smoke and verify `QUOTA_EXCEEDED`, no business row and violation audit.
45. If an approved test tenant/object exists, run exact-byte storage smoke and verify no orphan; otherwise record skipped.
46. Run Tenant A/Tenant B isolation smoke and Tenant Admin quota-mutation denial.
47. Confirm PlatformAdmin management without tenant membership and no implicit tenant business access.
48. Record final Git SHA, migration status, image digest, health, quota validation and unchanged business/commercial counts.

Stop for checksum/restore error, migration warning, ambiguous subscription, unapproved matrix, backfill mismatch, reconciliation drift, RLS/role regression, cross-Tenant disclosure, quota race, orphan object, health/log failure or unexpected business count. Print the STOP message and do not continue.

## Rollback and remaining risks

Prefer the recorded previous API image while retaining additive tables, counters and snapshots. Pre-Fix93 code ignores them, but rollback removes quota enforcement and may permit over-quota writes; temporarily disable affected write routes or place the API in maintenance mode and forward-fix. Do not delete usage history and do not restore an old database over newer valid Production data.

Deferred items are Product/Commercial quota values, provider integrations for workflow/webhook/email/AI, asynchronous reservation/reaper hardening, high-volume API aggregation, quota-table RLS, immutable Plan revision snapshots and object-store orphan reconciliation. These are explicit risks, not silently implemented assumptions.

## Local validation evidence

All evidence below was produced locally without connecting to Production, running the broad seed, or issuing destructive database commands.

- `npm ci`: passed; npm reported 27 dependency advisories (3 low, 14 moderate, 10 high). They pre-exist this feature and were not auto-fixed because a forced dependency rewrite is outside Fix93.
- `npm run prisma:generate`, `npx prisma validate`, and `npx prisma format`: passed. The first coverage attempt immediately after `npm ci` was invalid because the clean install restored the tracked pre-Fix93 Prisma Client; it failed before meaningful coverage. Regenerating the client fixed the environment and the repeated coverage run passed.
- Focused quota and affected-service regression run: 16 suites, 145 tests, all passed.
- Full configured Jest run: 64 suites passed, one conditional database suite skipped; 439 passed and 9 skipped out of 448. The skipped cases were subsequently run against PostgreSQL.
- PostgreSQL 16 integration run: all 51 migrations deployed from an empty database, migration status was up to date, and 9/9 quota integration tests passed. These include same-Tenant hard-limit concurrency, storage boundary concurrency, cross-Tenant isolation, workflow/webhook/email/AI idempotency, API counters/thresholds, UTC rollover, snapshot idempotency and advisory-lock serialization. Notification RLS remained ENABLE/FORCE (`true/true`). The disposable no-volume container was stopped and removed.
- Coverage after Prisma generation: 35.43% statements, 31.33% branches, 31.34% functions and 37.05% lines; 64 suites/439 tests passed and the same 9 conditional DB tests skipped.
- `npm run lint`: passed with 0 errors and 7 pre-existing warnings outside Fix93. Test TypeScript compilation and `npm run build` passed.
- `npm run ci`: passed (`prisma:generate`, lint, full configured tests and build). An earlier attempt was discarded after concurrent Docker/CI Prisma generation caused a local Windows `EPERM` engine rename; the independent sequential rerun passed.
- Docker build: passed as `iam-crm-backend:fix000093-local`, image `sha256:4eee067cf383c968e49a6f0544be4bed1d06ba1e39f065ea19d8a26531ab20b8`.
- Migration safety scanner completed successfully. Its conservative text scanner flags `ON UPDATE CASCADE` and foreign keys on the new empty tables; manual review confirms every delete action is `ON DELETE RESTRICT`, the migration is additive, and no business table is rewritten.
- Representative non-Production backup `database.dump` was found under the local safety artifacts. SHA-256 matched its manifest (`5e1779ef69250c8c478e35dd5a87c0132a226cec52db0153ba27de991380f44e`), `pg_restore` into a clean PostgreSQL 16 database completed with zero restore errors, and migrations 42 through 51 applied successfully. Baseline and post-validation business counts remained identical: 2 Organizations, 5 Users, 2 Companies, 2 Opportunities, 5 Files and 20,698,470 active storage bytes.
- The representative backup predates operational Fix91/Fix92 backfills: it had no Plans, Subscriptions or Entitlements and no active Memberships. Fix92 structural bootstrap created only its three compatibility shells. Fix93 structural bootstrap created disabled rows only (30 for three plans), repeated with zero creates; exact-Organization inventory backfill repeated as a no-op, validation passed, and reconciliation reported zero drift. Per the declared definition, ACTIVE_USERS was zero because no User had an active Membership.
- Runtime-role verification was performed only in the disposable restored database: `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, with required quota-table privileges. No MinIO container or existing object was modified.
