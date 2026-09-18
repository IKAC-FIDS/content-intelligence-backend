# Scheduled notifications (Phase 10)

Scheduled notifications converge on the existing Notification Core. The scanner only reads current Meeting/Task state, detects a due occurrence, and calls `NotificationCoreService.publishAndEvaluate`. It never resolves recipients, renders templates, checks preferences, creates deliveries, or calls providers.

## Configuration

- `NOTIFICATION_SCHEDULER_ENABLED=true` enables scanning. Set it to `false` on passive application instances.
- `NOTIFICATION_SCHEDULER_INTERVAL_MINUTES=5` controls scan cadence (1–60 minutes).
- All calculations use JavaScript `Date` absolute timestamps and PostgreSQL UTC values. No tenant timezone is hard-coded.

## Data model and tenancy

Each scheduled rule owns at most one `NotificationSchedule`. Multiple reminders use multiple rules, so a 24-hour email reminder and a 1-hour SMS reminder remain independently configurable. The table has mandatory `organizationId`, foreign keys, indexes, RLS, and FORCE RLS using `app.current_organization_id`.

## Supported definitions

- `MEETING.REMINDER`: `meeting.startAt`, `BEFORE`, relative negative offset; default grace 30 minutes.
- `TASK.DUE_SOON`: `task.dueAt`, `BEFORE`, relative negative offset; default grace 60 minutes.
- `TASK.OVERDUE`: `task.dueAt`, `AT_OR_AFTER`, zero offset; default/state lookback up to 365 days.

The server validates schedules against this catalog. Absolute offsets and grace periods cannot exceed 525,600 minutes.

## Windows and idempotency

Relative scans query only records whose source timestamp maps into `now - grace <= scheduledAt <= now`; exact timestamp equality is never used. Cancelled/completed records are excluded by current status. Overdue scans are bounded and batched. Each occurrence includes the current source timestamp and offset in its key:

`EVENT:{entityId}:{sourceAtISO}:OFFSET:{offsetMinutes}`

The existing unique `(organizationId, idempotencyKey)` constraint is the final multi-instance guard. Rescheduling naturally changes the key and stale source dates are no longer returned by current-state queries.

## Examples

```json
{"eventName":"MEETING.REMINDER","schedule":{"type":"RELATIVE","sourceField":"meeting.startAt","triggerMode":"BEFORE","offsetMinutes":-1440,"gracePeriodMinutes":30}}
```

```json
{"eventName":"MEETING.REMINDER","schedule":{"type":"RELATIVE","sourceField":"meeting.startAt","triggerMode":"BEFORE","offsetMinutes":-60,"gracePeriodMinutes":30}}
```

```json
{"eventName":"TASK.DUE_SOON","schedule":{"type":"RELATIVE","sourceField":"task.dueAt","triggerMode":"BEFORE","offsetMinutes":-1440,"gracePeriodMinutes":60}}
```

```json
{"eventName":"TASK.OVERDUE","schedule":{"type":"OVERDUE","sourceField":"task.dueAt","triggerMode":"AT_OR_AFTER","offsetMinutes":0,"gracePeriodMinutes":525600}}
```
