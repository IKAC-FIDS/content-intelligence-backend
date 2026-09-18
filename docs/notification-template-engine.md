# Notification template engine

Notification rules own **when, recipient and channel**. Templates own content and are resolved by
`organizationId + eventName + channel + locale`, selecting the highest active version.

Templates support property interpolation only, for example `{{user.fullName}}`. The authoritative
per-event allow-list lives in `notification-core.catalog.ts`. Expressions, method calls and the path
segments `__proto__`, `prototype` and `constructor` are rejected. Context builders query only approved
fields and always include the event organization in their database filters.

When an allowed value is absent or null, its placeholder remains unchanged and is returned in
`missingVariables`. This behavior is deterministic across every channel and makes incomplete content
visible rather than silently deleting it.

Changing a template creates the next version and preserves history. Activating a version deactivates
the current active version for the same organization, event, channel and locale. Delete endpoints are
kept for compatibility but perform soft deactivation. Delivery preparation renders per recipient and
stores the exact resolved template id; provider dispatch remains outside this phase.
