# Notification Phase 14 operations

Phase 14 extends the existing Notification Core. It does not introduce a second queue, worker, provider dispatcher, or cron subsystem.

## Runtime

- `NOTIFICATION_SCHEDULER_ENABLED=true` enables both existing scheduled rules and escalation scans.
- `NOTIFICATION_SCHEDULER_INTERVAL_MINUTES` controls the shared scheduler scan interval (default: `5`).
- `NOTIFICATION_WORKER_ENABLED=true` and the Phase 11 worker settings continue to control actual delivery.
- All policy timezones must be IANA identifiers, for example `Asia/Tehran`.

## Processing order

1. Resolve recipients and apply tenant scope.
2. Apply user preference unless the rule is mandatory.
3. Resolve delivery priority. `CRITICAL` bypasses quiet hours and digest.
4. Apply organization quiet hours.
5. Apply an explicitly linked digest policy.
6. Create the existing delivery row and let the Phase 11 worker dispatch it.

Quiet-hour deferral only updates `nextAttemptAt`/`deferredUntil` on the same delivery. A daily email digest uses one carrier delivery and keeps every source delivery as an auditable digest item. Escalation runs use unique `(organizationId, sourceEventId, stepId)` identities and re-check task status and due date before creating delivery jobs.

## Current domain boundary

The current organization model has `Team.managerId`, so escalation supports the existing `MANAGER` recipient resolver. There is no Department or Department Head entity; Phase 14 deliberately does not invent one. Daily digest is currently limited to email because it has the only controlled multi-item renderer in this phase.

## Migration

Apply `20260910193000_notification_quiet_digest_escalation` with `npx prisma migrate deploy` before starting the new application image. The migration adds tenant RLS policies and deterministic unique indexes for digest buckets/items and escalation runs.
