# Task assignment RBAC

Task assignment authority is determined by effective role permissions in the active organization. The base role (`REP`, `MANAGER`, `ADMIN`, or `BOARDS`) does not grant assignment authority by itself. Tenant custom roles therefore behave according to their permission matrix, including custom roles whose `baseRole` is `REP`.

## Permission semantics

- `task:create` creates a task assigned to the acting user with `assignmentScope=SELF`.
- `task:assign`, together with `task:create`, permits selecting another user, an active team, or the organization scope while creating a task.
- `task:reassign` permits changing the assignee, team, or scope of an existing open task.
- `task:assign` remains accepted as a compatibility fallback by `POST /tasks/:id/reassign`, matching the pre-existing API contract. `PATCH /tasks/:id/assign` continues to require `task:assign`.
- `task:create-subtask` or the existing `task:create` compatibility permission permits creating a self-assigned subtask. Assigning that subtask to another user, team, or organization scope additionally requires `task:assign`.
- `task:update` alone never grants assignment authority. If assignment fields are sent to `PATCH /tasks/:id`, the request additionally requires `task:reassign` or the documented `task:assign` compatibility permission.

`SELF` is always resolved to the acting user and cannot contain a team. `TEAM` requires an active team in the current organization; an optional assignee must be an active member of that team. `ORGANIZATION` cannot contain a team. Every named assignee must be active, internal, non-`BOARDS`, and a member of the current organization. Assignment permissions never permit cross-organization assignment.

Authorization failures use `TASK_ASSIGN_PERMISSION_REQUIRED` or `TASK_REASSIGN_PERMISSION_REQUIRED`. Reassignment continues to emit the existing `task.reassigned` audit event, and task creation continues to emit `task.created`.

## Recommended role sets

Basic task user:

- `task:view`
- `task:create`

Task dispatcher:

- `task:view`
- `task:create`
- `task:assign`

Task coordinator:

- `task:view`
- `task:view-team`
- `task:create`
- `task:assign`
- `task:reassign`
- `task:create-subtask`
- `task:update`
- `task:complete`

The default seed grants all task permissions to `ADMIN`; `MANAGER` receives task view/team view, create, create-subtask, update, assign, reassign, complete, and delete; `REP` receives view, create, create-subtask, update, and complete but not assign/reassign; `BOARDS` receives view only. No seed or migration change is required for these permissions because `task:assign` and `task:reassign` already exist.

## Admin UI and session behavior

The Admin role matrix groups all `task:*` permissions under “کارها / مدیریت کار”, explains the difference between assign and reassign, and warns when `task:assign` is selected without `task:create`. Permissions remain role-driven; no per-user permission storage is introduced.

Replacing role permissions increments `Organization.authorizationVersion` for the affected organization(s) and clears the in-process permission guard cache. Backend authorization therefore uses the new matrix on the next request after tenant context resolution. The frontend auth store is a session snapshot, so controls reflect changes after the session is reloaded/refreshed (or after logout/login); the UI does not claim live permission mutation in an already-rendered session.
