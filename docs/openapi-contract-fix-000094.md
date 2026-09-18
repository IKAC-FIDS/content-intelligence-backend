# Fix 000094 — OpenAPI and Shared Frontend/Backend Contract

## Architecture and policy

Fix94 establishes `openapi/openapi.json` as the canonical, committed OpenAPI 3 contract. Nest route metadata and the Swagger compiler plugin provide request DTO shape and validation parity; `src/openapi/openapi.document.ts` centrally supplies stable path-derived operation IDs, domain tags, actual security schemes, request-ID headers, success/error envelopes, safe public enums, pagination/filter/sort primitives, quota decimal strings and upload metadata. It publishes no Prisma model as a response schema. Service and route behavior are unchanged.

The generator creates a Nest application for metadata discovery but deliberately does not call `app.init()` or `listen()`. It runs no migration, seed, scheduler, database query, storage operation or external-provider request. Output keys are recursively sorted and contain no timestamp, machine path, server hostname, secret or build-specific Git metadata. Contract version `0.1.0` versions the artifact, not runtime routes.

Runtime Swagger is disabled by default in every environment. `OPENAPI_RUNTIME_ENABLED=true` opts in to UI at `/api/docs` and JSON at `/api/docs/openapi.json`; Production must leave it false unless exposure has been separately approved and access controls reviewed. The canonical file is always available at build/CI time, so Production UI is unnecessary.

## Security and behavior

`bearerAuth` models the existing JWT used by Tenant and Platform flows. `refreshCookie` documents only the existing HttpOnly refresh-cookie flow. Public health, login, refresh, SSO initiation/callback/exchange and passkey authentication operations explicitly have empty security; other operations require bearer authentication. Platform routes are identified from actual PlatformAdmin route families and state that Platform authority neither requires nor grants Tenant membership.

Tenant Organization is derived from trusted `TenantContext`; arbitrary tenant selection is not documented. Permission denial, inactive/suspended lifecycle and disabled entitlements are 403. Quota rejection is 429 with `QUOTA_EXCEEDED`. Quota values backed by BigInt are decimal strings. SSO response schemas are deliberately generic safe payloads and never reference credential-bearing request DTOs. Examples use only synthetic `.test` values and placeholder paths.

Success is `{ success: true, data, requestId, timestamp, meta? }`; pure pagination lifts `meta` beside `data`. Error is `{ success: false, error: { code, message, details? }, requestId, timestamp, path, method, statusCode }`. `x-request-id` is accepted from the caller when non-empty, otherwise generated, and echoed in both header and body. Existing binary/download behavior remains runtime-authoritative and is not redesigned.

## Generation and frontend handoff

Run `npm run openapi:generate`, then `npm run openapi:validate` and `npm run test:contract`. Frontend consumes `openapi/openapi.json` directly with its chosen OpenAPI TypeScript generator. This repository does not commit a large SDK or manually duplicated frontend interfaces. Stable operation IDs use normalized route segments plus HTTP action, for example `companiesGet` and `companiesPost`; IDs are tested for uniqueness and byte stability.

Workflow: backend change → update DTO/contract metadata → generate → validate → contract tests → breaking analysis → commit canonical artifact → frontend regenerates types/client → frontend typecheck/build. CI fails on artifact drift. On a pull request it extracts the target branch artifact with read-only `git show` and runs `openapi-diff`; removal of a path/method/response field, a new required request field, incompatible type/requiredness/location or security narrowing is breaking. Additive optional fields and operations are compatible. Enum additions require frontend review because closed-enum generators may treat them as source-breaking.

## Coverage inventory

Fix94 documents 53 controllers, 222 unique paths and 320 HTTP operations. Intentionally excluded HTTP operations: 0. Unintentionally undocumented public operations: 0. Maintenance utilities are CLI entrypoints rather than HTTP operations and therefore are not part of the public artifact. DTO schemas are compiler-generated from explicit controller DTO types and class-validator metadata; the centralized response strategy avoids publishing inferred Prisma service return types.

## Versioning strategy

Optional response fields and new endpoints are additive. Required input additions, field removals/type changes, narrowed enums and incompatible auth changes require a separately approved breaking release. Deprecation must first mark the operation/field and retain it for at least one supported frontend release. SDK and artifact versions follow semantic contract releases. A future `/v1` or `/v2` route family requires a separate backward-compatible fix and support-window decision; Fix94 does not move or rename any endpoint.

## Production operator runbook (documentation only)

Path `/opt/CRM/iam-crm-backend`, Compose project `iam-crm-backend`, API `iam-crm-backend-api-1`. PuTTY commands must not contain `exit`, `exit 1`, `set -e` or `set -euo pipefail`. On any failure print `echo "STOP: <reason>. Do not continue."` and stop manually.

1. Record current `HEAD`, `origin/main`, exact approved Fix94 SHA, complete incoming commit range and incoming files.
2. Verify the incoming range contains no `prisma/migrations` file and migration count is unchanged.
3. Review `package.json`/lock dependency changes, OpenAPI bootstrap, runtime exposure default and CI changes.
4. Record current API image digest and create an immutable rollback tag.
5. Back up `.env`, `.env.docker` and Compose overrides without printing secret values.
6. Record service health and disk availability; validate Compose configuration.
7. Fetch and fast-forward only to the exact approved SHA; do not merge, force, tag or edit Production environment files.
8. In the candidate build context run contract generation, standards validation, contract tests, sensitive-name scan and artifact drift check.
9. Build only the API image and record its digest.
10. Confirm no database migration command is required by Fix94 and do not restart DB or MinIO.
11. Recreate only API with `docker compose --env-file .env.docker -p iam-crm-backend up -d --no-deps --force-recreate api`.
12. Inspect API status and logs for bootstrap, Swagger, auth, Tenant, feature and quota errors.
13. Check backend `/api/health` and frontend proxy `/api/health`.
14. Smoke login/session refresh without exposing tokens in logs.
15. Smoke a representative authenticated Tenant endpoint and confirm request ID in header/body.
16. Smoke a PlatformAdmin endpoint and confirm a Tenant Admin without Platform authority remains denied.
17. Safely verify the quota 429 envelope only with an approved test tenant; otherwise record skipped.
18. Verify SSO provider responses do not echo secrets.
19. If runtime docs were explicitly approved/enabled, validate `/api/docs/openapi.json`; otherwise verify it is unavailable and validate the committed artifact inside the image.
20. Record final image digest, Git SHA, health, smoke results and unchanged migration count.

Rollback is application-image-only: restore the recorded image and recreate only API. Schema, quota counters/history, business data and MinIO are untouched. If runtime docs were enabled only for this release, restore the previous environment setting through the normal configuration process; do not delete artifacts manually.

## Remaining risks

Compiler inference cannot express every domain-specific response field while legacy controllers infer return values from services. Fix94 intentionally uses a safe explicit envelope plus opaque public payload rather than leaking Prisma models or destabilizing 320 operations. Domain response DTO enrichment can proceed additively. Runtime Swagger opt-in is not a substitute for publishing the canonical artifact through a controlled frontend pipeline.

## Local validation evidence

- `npm ci`: passed after terminating one stale local generator process that held the Windows Prisma DLL; npm reported 42 advisories (3 low, 27 moderate, 12 high). No forced audit rewrite was run.
- Prisma Client generation, `npx prisma validate`, test TypeScript compilation and production build: passed. Prisma schema and migration directories are unchanged.
- Canonical artifact: 1,776,980 bytes; two consecutive generations produced identical SHA-256 `2E2B18369B8F9C40F690794E9A901AB0BE62237315EF6E24D78974BDBD3B9AF6`.
- Standards validation: Redocly passed with zero errors/warnings after resolving all references and path parameters.
- Contract suite: 3 suites / 13 tests passed, including real `openapi-diff` compatible/breaking fixtures. Focused envelope, API usage, FeatureGuard, quota security, Platform authority and Tenant context regression: 7 suites / 38 tests passed.
- Full configured suite: 67 suites / 452 tests passed; one conditional PostgreSQL suite / 9 tests skipped under its existing environment gate.
- Coverage: 34.95% statements, 31.02% branches, 30.84% functions and 36.59% lines; 452 tests passed and the same 9 conditional DB tests skipped.
- Lint: passed with zero errors and seven pre-existing warnings outside Fix94. `npm run ci` passed generation, lint, full tests, build, OpenAPI generation/validation and contract tests.
- Sensitive response scan: zero response references for password hashes, refresh/access tokens, client secrets, private/secret keys, object keys or database/MinIO/JWT environment secrets. `clientSecret` appears only as the intentional write-only SSO request field.
- Docker API image build passed as `iam-crm-backend:fix000094-local`, image `sha256:2d90dc6022061e484c0467c295418d43dc8c024f10b52d6059aa2bf8ddc30b7a`.
- No Production access, deployment, database connection, migration, seed, destructive database command, persistent-volume removal or MinIO mutation occurred.
