# Notification delivery audit center

The delivery center exposes tenant-scoped operational metadata for notification deliveries. It intentionally excludes event payloads, rendered template bodies, provider credentials, and other secrets.

## Delivery and attempt lifecycle

`NotificationDelivery` remains the durable queue item and the idempotency boundary. Every claimed provider attempt appends one `NotificationDeliveryAttempt` row with its attempt number, trigger, actor, provider result, timestamps, and sanitized failure diagnostics. Automatic and manual retries reuse the same delivery row and never create a second logical delivery.

Manual retry is allowed only while the delivery is `FAILED`. The atomic status transition to `RETRYING` prevents concurrent administrators from scheduling duplicate retries. The worker then processes the normal queue path and records the administrator as the attempt trigger.

## Safe administration API

- `GET /api/admin/notification-deliveries` supports pagination plus event, channel, status, recipient, rule, template, trigger, provider, aggregate, date, search, and allow-listed sort filters.
- `GET /api/admin/notification-deliveries/:id` returns a masked destination, abbreviated deduplication key, safe relation metadata, and attempt history. It never returns the raw event payload or template body.
- `POST /api/admin/notification-deliveries/:id/retry` queues one failed delivery for retry.

All queries are constrained to the active organization and execute inside the existing tenant transaction/RLS context.

## Migration and deployment

Migration `20260910190000_notification_delivery_audit_center` is additive. It creates the attempt table, retry-request audit fields, enums, indexes, foreign keys, and tenant RLS policy. It requires no backfill. As agreed for phases 10–14, do not deploy it separately; run the normal single `prisma migrate deploy` after all phase migrations are present.
