# ADR 000082: Shared-Database, Shared-Schema Multi-Tenancy

- Status: Accepted for the architecture baseline
- Date: 2026-07-31
- Runtime implementation: Deferred to later approved fixes
- Dependency: fix 000081 (`ea5a9ab85d4390e378c1ecb7752304289b38b9e6`)

## Context

The CRM is effectively single-tenant. The existing `Organization` model represents the current company, and selected core records already carry `organizationId`, but the repository has no authoritative membership model, platform-administration model, active-tenant resolver, or complete tenant discriminator coverage. Existing identifiers, relationships, history, files, and data must be preserved while the product evolves toward SaaS tenancy. Introducing persistence, resolution, authorization, query enforcement, and data migration in one change would create an unacceptable partial-isolation state.

Fix 000082 therefore records the target architecture and adds only shared, Prisma-independent TypeScript contracts. It does not activate multi-tenant runtime behavior.

## Decision

IAM CRM will use a **shared PostgreSQL database and shared schema**. Tenant-owned records will eventually have an explicit, unambiguous tenant ownership path. Initially, a Tenant is represented by an existing `Organization`; separating those concepts later requires another ADR.

Membership is the authoritative user-to-tenant association. Platform administration is separate from tenant administration. A trusted `TenantContext` may be constructed only from authenticated, validated server-side information. Client input can nominate a tenant but cannot authorize one.

### Domain definitions

- **Tenant:** the isolation and ownership boundary within which CRM data, authorization, configuration, auditing, quotas, and entitlements are evaluated. It must not be resolved from arbitrary client input.
- **Organization:** the existing business entity for the current company and future customers. The current company Organization becomes the initial tenant, but an Organization ID in a URL, DTO, record, or client cache grants no access and does not establish membership.
- **Membership:** the authoritative relationship between a user and Tenant. Future persistence must identify the membership, user, tenant/organization, status, tenant role, permissions, activation/revocation state, and audit metadata. Only an active validated membership authorizes tenant context; invited, suspended, revoked, or missing memberships fail closed.
- **Tenant Owner / Tenant Admin:** tenant-scoped administrators whose authority exists only through the active membership for that Tenant. Neither role grants platform authority.
- **Platform Admin:** an explicit, auditable, deny-by-default platform identity. It is not inferred from a tenant role and does not imply membership or business-data access in every Tenant. Platform support access to tenant data must be separately authorized and audited.
- **Existing-company tenant:** the current Organization that owns existing CRM data. Later migration associates existing records with it additively and idempotently while preserving identifiers, timestamps, ownership, relationships, audit history, and file keys.

## Rationale

Shared database/shared schema supports incremental additive migration, matches the existing PostgreSQL and Compose deployment, minimizes initial operational complexity, preserves identifiers and relationships, and centralizes schema evolution. It avoids multiplying database lifecycle, backup, migration, monitoring, and connection-management burdens during the transition.

This choice demands rigorous tenant predicates, tenant-aware uniqueness and indexes, strong authorization, cross-tenant regression coverage, and explicit scoping of every secondary system. Those requirements are architectural obligations, not optional conventions.

## Alternatives considered

| Alternative | Benefits | Risks and isolation | Operational/migration cost | Decision |
| --- | --- | --- | --- | --- |
| Database per Tenant | Strong physical isolation; independent backup/restore | Cross-tenant administration and analytics are harder; fleet drift is possible | Highest provisioning, connection, monitoring, and migration fan-out cost; difficult transition from current data | Rejected for the initial architecture |
| Schema per Tenant | Namespace isolation inside one database | Search-path and connection-state errors can leak data; schema drift remains possible | High migration fan-out and growing catalog/operational complexity | Rejected |
| Shared database/shared schema | Additive migration, centralized evolution, existing deployment compatibility | A missing predicate can leak or mutate cross-tenant data; isolation is logical | Lowest initial cost, but requires disciplined enforcement, constraints, and tests | Accepted |
| No explicit tenant boundary | No immediate migration work | No defensible SaaS isolation or tenant-aware authorization | Defers cost while increasing future risk and ambiguity | Rejected |

## Platform Core and CRM Domain

**Platform Core** owns tenant identity, Organization lifecycle at platform scope, Membership lifecycle, Platform Admin, tenant resolution, authentication integration, tenant-level authorization inputs, Tenant status, entitlements, quotas, request/audit context, request and correlation IDs, and tenant-aware conventions for caches, jobs, events, and file ownership.

**CRM Domain** owns tenant business data and behavior: Companies, People, Contacts, Opportunities, Activities, Tasks, Meetings, Notifications, Product Catalog, commercial documents, Payments, Attachments, Reports, the sales pipeline, and related history/audit events.

CRM services will consume trusted `TenantContext`; they must not independently resolve a Tenant, and DTOs must not establish context. Platform Core must not silently grant CRM data access. Platform operations remain distinct from tenant-owned methods. Domain-facing contracts do not import Prisma models.

## Authoritative tenant resolution priority

1. Validate an authenticated user or service identity from signed server-validated session/token material.
2. Load and validate an authoritative active Membership belonging to that identity, and confirm that the Tenant status permits access.
3. If the user explicitly requests an active Tenant, treat it only as a candidate and validate it against authoritative memberships before constructing context.
4. A temporary single-tenant migration compatibility path may be added only by a later approved fix. It must be scoped, measurable, non-sensitive in logs, tested, and have a removal plan.

Request-body, query, or route `organizationId`; arbitrary headers; unsigned claims; browser storage; cached client state; a Tenant ID read from the target record; a hardcoded Organization; or the first Organization in the database must never independently establish `TenantContext`. Missing context fails closed. Fix 000082 does not implement any resolver or compatibility fallback.

## Shared contracts

`TenantContext` is immutable by TypeScript convention and contains tenant and Organization identity, user and Membership identity, tenant role, string permissions compatible with the existing permission system, explicit platform-authority state, Membership status, a constrained resolution source, and optional request correlation. It contains no Prisma models, tokens, password hashes, credentials, or hardcoded Tenant IDs.

`PlatformScopeContext` represents explicit platform authority without implying Tenant membership. `TenantAwareService<TInput, TResult>` standardizes the ordering of trusted context and operation input for future tenant-owned operations. `assertActiveTenantContext` is a pure fail-closed assertion for future trusted boundaries; it performs no resolution or defaulting and is not wired into runtime behavior by this fix.

## Tenant-aware service standard

A future tenant-owned service must receive trusted context, reject missing/invalid context and inactive Memberships, and scope every read, write, unique lookup, search, count, aggregate, group, export, raw query, and atomic transaction to the Tenant. It must avoid revealing inaccessible record existence and should use equivalent not-found behavior where appropriate.

Tenant identity must propagate to jobs, queues, events/outbox records, audits, cache and idempotency keys, file ownership/prefixes, metrics, and applicable rate limits while preserving request/correlation IDs. External calls should not be wrapped in unnecessarily long database transactions. Platform-scoped operations must use distinct explicit methods.

Unscoped Prisma reads, updates, deletes, aggregates, raw SQL, cache access, exports, or background work are prohibited for tenant-owned resources unless an ownership-safe composite key and verified scope make the operation unambiguous.

## Existing-data migration strategy (deferred)

Later approved fixes must follow an expand-and-contract sequence and the safety baseline from fix 000081:

1. **Inventory and ownership mapping:** classify tenant/platform tables and direct/indirect ownership; capture row counts, nulls, duplicates, orphans, conflicts, constraints/indexes, and file/MinIO references.
2. **Additive expansion:** add reviewed nullable discriminators or another compatible strategy without misleading defaults; retain legacy ownership and APIs; assess index locks and write impact.
3. **Idempotent backfill:** associate existing records with the operator-confirmed current Organization; preserve IDs, timestamps, owners, relationships, history, audits, and object keys; use bounded observable dry-run/report-capable logic; never overwrite valid assignments or guess conflicts.
4. **Dual compatibility:** write new fields while supporting additive rollout and code rollback; measure and safely log fallback use without broadening access.
5. **Validation:** compare row counts, nulls, orphans, cross-tenant relationships, duplicates, uniqueness conflicts, file references, current-company behavior, and at least two additional Tenant contexts.
6. **Constraint hardening:** only after clean validation and review of SQL, locks, timeouts, maintenance needs, and rollback limitations, add NOT NULL, Tenant-aware uniqueness/FKs, and indexes.
7. **Contract cleanup:** remove fallbacks and legacy paths only after measured evidence and a separate approved fix.

All existing Users, Teams, Roles, Permissions, Organizations, Companies, People, Contacts, social channels, Opportunities and line items, Activities, histories, Tasks, Meetings, Notifications, Product Catalog records, commercial documents, Payments, Attachments, Passkeys, external identities, refresh sessions, audit/configuration records, MinIO objects and keys, identifiers, timestamps, ownership, and relationships must be preserved.

## Consequences

- Every tenant-owned query and mutation must eventually be scoped.
- Applicable uniqueness, foreign keys, and indexes must become tenant-aware.
- Jobs, events, auditing, caches, idempotency, metrics, rate limiting, exports, and object storage must carry Tenant identity.
- Cross-tenant tests and current-company regression tests become mandatory.
- Platform operations and support access must remain explicit and auditable.
- Runtime adoption must be staged; partial enforcement is unsafe.

## Risks and mitigations

Principal risks are missing predicates; cross-tenant disclosure/mutation; incorrect current-Organization fallback; Tenant/Platform Admin conflation; tenant-unsafe uniqueness, caches, jobs, or files; partial migration states; and rollout complexity.

Mitigations are trusted context, deny-by-default behavior, centralized scope utilities, additive reviewed migrations, idempotent observable backfills, fix 000081 preflight/backup/isolated-restore evidence, cross-tenant and existing-company tests, request-correlated auditing, measurable compatibility fallbacks, and later removal of temporary paths.

## Deferred implementation

Membership and Platform Admin persistence, Tenant schema fields, runtime resolution, active-Tenant selection, guards/interceptors/middleware/decorators, authentication claims, query enforcement, tenant-aware constraints/indexes, cache/job/event/outbox/search/metrics/rate-limit/idempotency propagation, file isolation, existing-data backfill, validation and hardening, compatibility cleanup, and frontend Tenant switching are deferred.

## Compatibility and operational impact

Fix 000082 adds no API, DTO, response, authentication, authorization, session, cookie, header, controller, service-runtime, Prisma schema, migration, SQL, backfill, database, MinIO, or Production behavior change. Deployment may be deferred until a later runtime fix consumes the contracts. Application rollback is reverting this documentation/contract commit; no database or storage rollback is appropriate.
