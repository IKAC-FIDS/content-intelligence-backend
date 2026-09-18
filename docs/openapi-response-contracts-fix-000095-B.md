# fix 000095-B — Add Typed OpenAPI Response Contracts

## Problem and scope

Frontend Fix108 preflight found that the deterministic Fix94 contract was valid but almost every successful response used `object` plus `additionalProperties: true`. Generators therefore emitted `Record<string, unknown>`. This bounded phase types shared pagination/error contracts and the required Companies and Tasks operations; it does not rewrite the remaining API.

## Runtime architecture

`ApiResponseInterceptor` is the source of truth. A pure `{ data, meta }` pagination payload is lifted to `{ success, data, meta, requestId, timestamp }`; other values are wrapped as `{ success, data, requestId, timestamp }`. `ApiExceptionFilter` emits `{ success:false, error:{code,message,details?}, requestId, timestamp, path, method, statusCode }`. No runtime behavior changed.

Pagination metadata is exactly `total`, `page`, `limit`, `totalPages`, `hasNext`, and `hasPrevious`. Dates serialize as ISO date-time strings, Prisma Decimal values as strings, and exposed BigInt values as decimal strings. Nullable database columns are marked nullable; properties returned by Prisma are distinct from optional relation groups that vary between Company summary and detail queries.

## Contracts

Companies GET list uses `CompanyListItem[]` plus `PaginationMeta`; POST, GET detail and PATCH use `CompanyResponse`. Tasks GET list uses `TaskResponse[]` plus pagination; POST, GET detail and PATCH use `TaskResponse`. DELETE actually returns HTTP 200 with the deleted scalar task and is documented as `DeletedTaskResponse` rather than falsely claiming 204.

The schemas reuse Prisma enum values for Company ownership/activity state, pipeline stage, priority and task status. Nested relation summaries document only relations selected by the services; no new fields are exposed at runtime.

## Quality gates and coverage

`test/openapi-typed-responses.spec.ts` rejects the generic fallback for all nine required operations and verifies representative pagination, errors, nullable date-time and enum values. `openapi:response-coverage` classifies every successful response and lists legacy generic responses as `METHOD PATH STATUS`. Only the in-scope operations are required to be typed in this phase.

Before (Fix95): 319 successful responses: 1 typed, 317 generic, 1 no-content, 0 missing schema. After: 319 successful responses: 10 typed, 308 generic, 1 no-content, 0 missing schema.

## Frontend handoff and remaining phases

The nine required operations now resolve to named concrete schemas, so generated Company and Task response types no longer degrade to generic records. Recommended follow-up phases are: People/Opportunities/Meetings; financial documents/payments; auth/passkey/security endpoints; then Platform/Admin APIs and removal of the last fallback.

## Database, rollback, and safety

No Prisma schema change or migration is required. No database command is part of this fix. Reverting the code and canonical artifact restores the previous OpenAPI metadata only; API runtime behavior and stored data are unaffected. The artifact remains deterministic, uses a relative server URL, and contains no Production host or credentials.
