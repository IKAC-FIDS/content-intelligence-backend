# Phase 6: existing inbox integration

## Architecture

TasksService / MeetingsService publish NotificationEvent through
NotificationCoreService. Rule evaluation creates independent NotificationDelivery
rows for the selected channels. Pending IN_APP deliveries are automatically
dispatched through NotificationDeliveryDispatcher and InAppNotificationChannelHandler.
The handler uses NotificationsService.createInternal to create the existing
Notification entity. There is one inbox and one unread counter.

No Prisma schema changes, migration, new package, or seed are required in this
phase. Earlier phase migrations must already be deployed. No data was seeded
and no production database was changed during implementation.

## Rules and templates

Organizations must configure active rules and active IN_APP templates before
enabling these notifications. There is no unconditional legacy fallback for
the migrated task events. An organization with no matching enabled rule will
not receive those automatic task notifications.

Suggested setup (use the organization's locale, normally fa-IR):

| Event | Recipient | Subject | Body |
| --- | --- | --- | --- |
| TASK.ASSIGNED | ASSIGNEE | کار جدیدی به شما ارجاع شد | {{task.title}} |
| TASK.REASSIGNED | ASSIGNEE | کار به شما ارجاع شد | {{task.title}} |
| TASK.COMPLETED | CREATOR | کار تکمیل شد | {{task.title}} |
| MEETING.CREATED | ASSIGNEE | جلسه جدید | {{meeting.title}} در {{meeting.startAt}} |
| MEETING.UPDATED | ASSIGNEE | جلسه به‌روزرسانی شد | {{meeting.title}} |
| MEETING.CANCELLED | ASSIGNEE | جلسه لغو شد | {{meeting.title}} |

IN_APP subjects are required when creating, updating, or activating templates.
The handler validates the stored template's event, channel, organization and
active state. Empty subjects or unresolved placeholders are not delivered.
The approved task context also includes priority, opportunity.title and dueDate
(an alias for existing dueAt). No raw model or payload is exposed as template context.

## Routes and security

NotificationActionUrlResolver derives routes solely from aggregate type, event
prefix and an identifier restricted to letters, digits, underscore and hyphen.
Task routes are /tasks/:id; meeting routes are /meetings/:id. Opportunity routing
is prepared for future catalog events. Arbitrary payload/template URLs are ignored.
Unsafe identifiers and unresolvable routes produce INVALID_ACTION_URL.

The frontend rejects external URLs, protocol-relative URLs, backslashes,
encoded variants and control characters. Valid internal URLs navigate after
marking the notification read according to existing permissions. Items without
a safe link open a dialog displaying the notification text.

The handler verifies an active user and an active membership of the event's
organization. The creation service verifies this again. All inbox/delivery work
runs with the existing tenant transaction helper and transaction-local RLS
context. Cross-organization events, recipients and templates cannot be combined.

## Traceability and concurrency

For IN_APP, NotificationDelivery.providerMessageId contains the Notification ID:
the provider is the existing application inbox. This reuses an existing nullable
field and avoids a new relation/migration. Notification.metadata stores source,
eventId, deliveryId and deduplicationKey. This link is for diagnostics; it is not
a foreign key, and deleting an inbox item does not delete its delivery history.

The handler atomically claims a PENDING, RETRYING or FAILED delivery using
updateMany. The claim, inbox creation, existing notification.created audit, and
DELIVERED update share one database transaction. A concurrent claim waits for
the row lock, then sees the completed status and creates nothing. If the final
delivery update fails, the inbox insertion and audit roll back with the claim.
The error handler records a controlled failure without overwriting a concurrent
success. A failed attempt can be dispatched again safely.

Event and delivery insertions use skipDuplicates / ON CONFLICT so replay does
not abort the surrounding PostgreSQL transaction on a unique-key conflict.

## Delivery versus inbox state

| Record | State meaning |
| --- | --- |
| Delivery DELIVERED | Notification persisted in the inbox |
| Notification readAt=null, archivedAt=null | خوانده‌نشده |
| Notification readAt set, archivedAt=null | خوانده‌شده |
| Notification archivedAt set | بایگانی‌شده, regardless of readAt |

Read, unread, archive, unarchive, read-all and delete continue using existing
notification APIs and audit behavior. They never update NotificationDelivery.

## Legacy migration and APIs

Assignment (including child tasks), reassignment and completion now publish
Core events; their former direct notifyUser calls are removed. Reviewer events,
parent-ready notifications, task rescheduling and meeting reminders retain
their existing paths because the catalog has no exact equivalent for them.
Rescheduling is not treated as reassignment.

No new HTTP route was added. Existing POST
/admin/notification-deliveries/:id/dispatch now also handles IN_APP, including
failed IN_APP attempts. Existing notification:manage authorization remains.
Existing channel-status responses report IN_APP as available/configured/enabled/usable.
Admin delivery history displays DELIVERED, timestamps, failure details and the
internal notification ID. User inbox pages show read/archive states only.

## Limitations

- There is no background worker or scheduler in this phase. New IN_APP deliveries
  are dispatched inline after rule evaluation. Existing pending/failed deliveries
  can be dispatched by an administrator.
- Domain changes and notification-event publication are not in one outbox
  transaction. Notification failures are logged without turning an already
  committed task/meeting change into an HTTP failure. Operational recovery is
  still necessary if publication itself fails during a database outage.
- Templates are selected during rule evaluation. If none is active, the existing
  rule engine records an unresolved evaluation and creates no delivery. Configure
  templates before triggering the domain action.
- Tests exercise transaction rollback and concurrent callers with an in-memory
  transactional fixture. A live PostgreSQL concurrency/RLS test and the manual
  server scenarios below must be verified in the deployment environment.

## Manual verification

1. In Admin Notifications, create an active TASK.ASSIGNED / IN_APP template and
   enabled rule with ASSIGNEE recipient as shown above.
2. Assign a task to an active user in the same organization.
3. In admin history, verify one IN_APP delivery is DELIVERED, with sentAt,
   deliveredAt and the internal notification ID populated.
4. Sign in as that recipient, refresh or wait for the existing unread polling
   interval (60 seconds), and confirm the bell count increases and the item
   appears in the existing attention center.
5. Open it: confirm the read state and navigation to /tasks/:id.
6. Mark unread, archive, and unarchive; confirm unread count changes appropriately
   and the admin delivery remains DELIVERED throughout.
7. Repeat with MEETING.CREATED / ASSIGNEE / IN_APP and verify /meetings/:id.
8. Configure EMAIL + SMS + IN_APP on one recipient rule. Verify separate delivery
   rows; IN_APP is automatically delivered through the existing inbox. Other
   channels retain their phase-specific sending behavior.
9. Dispatch a delivered IN_APP ID twice (including concurrent requests): the
   response must not claim a new send and only one inbox row must exist.
10. Confirm a rescheduled task and reviewer notifications still use their legacy
    behavior, while task assignment does not create a second legacy inbox row.
11. Use an administrator in organization B with an organization A delivery ID:
    dispatch must be rejected and no inbox item may be created in either tenant.
12. Send a manual notification using the existing API, with no action URL; confirm
    its text opens in the detail dialog and existing read/archive/delete still work.

## Changed files

Backend source:

- src/audit-log/audit-log.service.ts
- src/notifications/notifications.service.ts
- src/tasks/tasks.module.ts
- src/tasks/tasks.service.ts
- src/meetings/meetings.module.ts
- src/meetings/meetings.service.ts
- src/notification-core/notification-admin.service.ts
- src/notification-core/notification-channel-handler.ts
- src/notification-core/notification-core.catalog.ts
- src/notification-core/notification-core.module.ts
- src/notification-core/notification-core.service.ts
- src/notification-core/notification-delivery-dispatcher.service.ts
- src/notification-core/notification-rule-engine.service.ts
- src/notification-core/notification-template-engine.service.ts
- src/notification-core/in-app/in-app-notification-channel.handler.ts (new)
- src/notification-core/in-app/notification-action-url.resolver.ts (new)
- src/notification-core/in-app/notification-tenant-context.ts (new)

Backend tests:

- test/in-app-notification-channel.spec.ts (new)
- test/notification-core-dispatch.spec.ts (new)
- test/meetings.service.spec.ts
- test/notification-template-engine.service.spec.ts
- test/opportunity-task-list-filters.spec.ts
- test/task-review.service.spec.ts
- test/tasks.service.spec.ts
- test/tenant-scope-enforcement.spec.ts

Frontend (iam-crm-frontend-shadcn):

- apps/web/src/features/attention/pages/AttentionCenterPage.tsx
- apps/web/src/features/notification-core/pages/AdminNotificationsPage.tsx
- apps/web/src/features/attention/pages/AttentionCenterNotifications.test.tsx (new)
- apps/web/src/features/notifications/utils/notificationDisplay.ts (new)
- apps/web/src/features/notifications/utils/notificationDisplay.test.ts (new)

This report: docs/notification-in-app-channel.md (new).

## Validation results (2026-09-07)

- Prisma validate and generate: passed; schema unchanged.
- Backend npm run build: passed.
- Frontend npm run build (TypeScript + Vite): passed.
- Focused backend notification/task/meeting tests: 82 passed.
- Focused frontend inbox/navigation/bell tests: 25 passed.
- Backend full npm test: 611 passed, 9 failed, 9 skipped; 79 passing suites,
  9 failing suites and one skipped suite. Failures remain in unrelated existing
  interceptor mocks, tenant-scope expectation, financial permissions/types,
  CompaniesService/UsersService constructor fixtures and activity-center fixture.
- Frontend full npm run test:run: 179 passed, 3 failed; all three failures are in
  the existing phase21Forms.test.tsx contact form tests, outside these changes.
- Full backend lint: existing no-useless-assignment error in activities.service.ts.
- Full frontend lint: existing errors in IdentityAvatar, AdminEmailSettingsPage
  and PersonContactsSection. Lint on changed source files passes.
- git diff --check: passed (Windows line-ending notices only).
- Live server/manual PostgreSQL/browser scenarios were not executed. No commit,
  push, deployment, migration or seed was run.
