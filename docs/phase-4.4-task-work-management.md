# Phase 4.4 — Task & organization-wide work management

## Existing architecture

The existing NestJS `tasks` module used explicit, tenant-scoped relations to Company, Person, Opportunity, Commercial Document and Payment. Tasks already had creator, assignee, priority, due/reminder dates and the stable `TODO`, `IN_PROGRESS`, `DONE`, `CANCELLED` workflow. Mutations use the shared audit and notification services; list APIs use the standard `{ data, meta }` pagination contract. Phase 4.4 extends these patterns without replacing the existing routes or relation columns.

## Assignment model and visibility

- `SELF`: assigned to the acting user; no team is allowed.
- `TEAM`: requires an active same-organization team. An optional assignee must be an active member of that team.
- `ORGANIZATION`: may be unassigned or assigned to an active user in the same organization; it has no team target.

All reads and writes remain tenant-scoped. Normal users retain creator/assignee and related-record visibility. `task:view-team` enables team scope and `task:view-organization` enables organization scope. Administrators retain full tenant visibility. Picker results are paginated, searchable, active-only and organization-scoped.

## Reassign versus subtask

`POST /tasks/:id/reassign` changes responsibility on the same open task and records before/after scope, team and assignee plus the optional reason. The legacy `PATCH /tasks/:id/assign` remains available and adapts to the reassignment operation.

`POST /tasks/:id/subtasks` creates a new task with its own assignment, status, priority and due date. It does not change the parent assignee. Linked entities are inherited by default and can be omitted with `inheritLinkedEntity=false`. `GET /tasks/:id/subtasks` returns one child level. Hierarchy depth is limited to three levels and cycle/cross-tenant checks are authoritative in the backend.

## Completion and status

Allowed transitions are `TODO -> IN_PROGRESS|DONE|CANCELLED` and `IN_PROGRESS -> DONE|CANCELLED`; terminal tasks cannot be reopened implicitly. Cancellation requires a reason. A parent cannot complete while any direct child is neither `DONE` nor `CANCELLED`; the API returns `TASK_INCOMPLETE_SUBTASKS` with `incompleteSubtaskCount`. Resolving the final child notifies the parent assignee that the parent is ready, but never auto-completes it.

## Linked entities

Tasks retain the existing Company, Opportunity, Person, Commercial Document and Payment fields and add validated relations to Meeting, Activity and Product Catalog Item. Entity option lookup is server-side, paginated, searchable and permission/tenant scoped. Task detail responses contain one-level summaries and links; no unvalidated free-text foreign key is used.

## APIs

- `GET /tasks` — pagination plus status, priority, assignee, creator, scope, team, due-state, linked-entity and view filters.
- `GET /tasks/options/teams` — active team picker options.
- `GET /tasks/options/entities` — Company/Opportunity/Person/Meeting/Activity/Product options.
- `POST /tasks/:id/reassign` — dedicated reassignment.
- `GET|POST /tasks/:id/subtasks` — child list/create.
- Existing create, update, detail, status, complete, reschedule, assign and delete routes are preserved.

## Permissions

This phase adds `task:view-team`, `task:view-organization`, `task:reassign` and `task:create-subtask`. Existing `task:view`, `task:create`, `task:update`, `task:assign`, `task:complete` and `task:delete` continue to work. The old assign permission is accepted on the new reassign endpoint for compatibility.

## Audit and notifications

Audit actions include `task.created`, `task.updated`, `task.linked_entity_changed`, `task.reassigned`, `task.subtask_created`, `task.status_changed`, `task.completed`, `task.rescheduled` and `task.deleted`. Events include tenant identity; reassignment captures the requested reason. Existing notification infrastructure sends task assignment/reassignment/subtask assignment, completion and parent-ready messages with a task-detail link while avoiding self-notifications.

## Migration behavior

Migration `20260830210000_add_task_work_management` is additive. Existing creator-owned assignments remain `SELF`; records assigned to another user or left unassigned become `ORGANIZATION`. Historical teams are deliberately not guessed. Existing statuses, dates, assignees and business relations are unchanged. New foreign keys use `SET NULL` except parent deletion, which is restricted, and indexes cover the new list/filter paths.

## Known limitations

- Product Catalog is currently global in the existing schema, so product validation is active-item scoped rather than organization scoped.
- Only one child level is embedded in task detail to prevent recursive payload growth.
- Due-soon scheduling was not added because the current task scheduler has no reusable due-soon job; existing reminder behavior is preserved.
