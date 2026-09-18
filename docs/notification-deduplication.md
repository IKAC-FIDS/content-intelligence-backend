# Notification delivery deduplication

Notification event idempotency and delivery deduplication are separate boundaries. An event uses
`NotificationEvent.idempotencyKey`; each resolved user/channel delivery uses a deterministic `v1`
SHA-256 key over the canonical JSON tuple:

`[version, organizationId, eventOccurrenceKey, recipientUserId, channel]`

`eventOccurrenceKey` is the event's required logical `idempotencyKey`. Rule, recipient-rule,
template, destination address, status, attempt timestamps and database UUID are deliberately not
part of delivery identity. Consequently overlapping USER, ROLE and TEAM rules, or different
templates selected by those rules, produce one logical delivery for an event occurrence, user and
channel. EMAIL, SMS, PUSH and IN_APP remain separate deliveries. PUSH endpoint fan-out stays inside
the channel handler and does not change delivery identity.

The database enforces `UNIQUE (organizationId, deduplicationKey)`. Creation uses `createMany` with
`skipDuplicates` and then retrieves the authoritative row, so a concurrent loser is returned as an
explicit duplicate without aborting the tenant transaction. Retries reuse that row and only change
status and attempt metadata.

Scheduled event identities already contain aggregate ID, source date and offset. For example,
24-hour and 1-hour meeting reminders have distinct occurrences, while repeated scans of the same
offset do not create new deliveries. Rescheduling changes the source date and therefore creates a
new logical occurrence.

The database prevents duplicate delivery rows and workers atomically claim a row before dispatch.
This is not a claim of provider-level exactly-once delivery: a provider may accept a message before
the process records `SENT`. SMS receives the delivery key when supported; PUSH derives a stable
per-endpoint provider key. Providers without idempotency support retain this unavoidable crash
window.
