# Phase 4.6 — Task Submission, Review & Rework

## Overview

Task execution and task review are independent lifecycles. `Task.status` continues to
represent execution (`TODO`, `IN_PROGRESS`, `DONE`, `CANCELLED`) while
`Task.reviewStatus` represents approval. Existing tasks opt out of review by default.

## Review states

- `NOT_REQUIRED`: the task does not use the review workflow.
- `DRAFT`: review is required, but no submission is pending.
- `PENDING_REVIEW`: a submission round is waiting for the assigned reviewer.
- `CHANGES_REQUESTED`: the reviewer returned the latest round for rework.
- `APPROVED`: the latest submitted round was approved.

Review rounds have their own immutable decision history: `PENDING`, `APPROVED`,
`CHANGES_REQUESTED`, or `CANCELLED`.

## Reviewer model and permissions

Phase 4.6 assigns one reviewer to each review-required task. The reviewer must be an
active user in the same organization, must have `task:review`, cannot be a `BOARDS`
user, and cannot be the current assignee. Self-review is rejected with
`TASK_SELF_REVIEW_NOT_ALLOWED`.

- `task:assign-reviewer`: configure or change the task reviewer.
- `task:submit-review`: submit an accessible task for review.
- `task:review`: read review context and approve or request changes when assigned.

The backend remains authoritative for all permission, tenant, reviewer, and state
checks. The frontend uses effective permissions only to present available actions.

## Submission flow

`POST /tasks/:id/submit-review` accepts an optional submission note and optional IDs
of existing task-linked artifacts. The reviewer can be supplied when the caller has
reviewer-assignment permission, otherwise the task's configured reviewer is used.

Submission atomically validates the current state, calculates the next backend-owned
round number, creates `TaskReviewRound` plus `TaskReviewArtifact` links, and changes
the task review state to `PENDING_REVIEW`. A database uniqueness constraint on
`(taskId, roundNumber)` and serializable transactions protect against duplicate
rounds. Submitting from `CHANGES_REQUESTED` creates a new round and never overwrites
the earlier one.

Artifacts are references to the Phase 4.5 `FileAttachment` model; no file metadata is
duplicated. Every submitted artifact must belong to the same organization, remain
active, and already be linked to that task through `ArtifactLink`.

## Review decisions, rework, and resubmission

- `POST /tasks/:id/review/approve` approves the current pending round. Its comment is
  optional.
- `POST /tasks/:id/review/request-changes` returns the round for rework and requires a
  non-empty comment.
- Only the assigned reviewer can decide the pending round.
- A changes-requested task remains editable; editing alone does not create a round.
- Resubmission uses the same submit endpoint and creates Round 2, Round 3, and so on.
- `GET /tasks/:id/reviews` returns the full chronological business history. Task list
  responses contain only reviewer, review state, latest-round summary, and count.

Approving or requesting changes atomically updates both the pending round and task
review status. Conditional state updates prevent double approval and simultaneous
conflicting decisions.

## Completion, edits, cancellation, and subtasks

A review-required task cannot become `DONE` until `reviewStatus = APPROVED`; the API
returns `TASK_REVIEW_NOT_APPROVED`. Existing unresolved-subtask completion rules still
apply independently.

Material edits after approval reset the task to `DRAFT`. Material fields are title,
description, assignment, and linked business entities. Ordinary metadata changes do
not invalidate approval. Changing the reviewer while a round is pending is rejected
instead of mutating historical reviewer data.

Cancelling a task prevents later submission or review actions and cancels any pending
review round. Subtasks do not inherit review settings automatically; each task must be
configured explicitly. Parent and child completion/review requirements remain
independent.

## Notifications and audit

The existing Notifications module is reused for review requests, resubmissions,
changes requested, approval, and reviewer assignment/change. Links target
`/tasks/:id#review`, and the acting user is excluded where appropriate.

The audit log records `task.review_required`, `task.reviewer_assigned`,
`task.reviewer_changed`, `task.review_submitted`, `task.review_resubmitted`,
`task.review_changes_requested`, and `task.review_approved`. Metadata contains IDs,
round number, decision, artifact IDs, and comments where appropriate; artifact content
is never logged. Review-round records remain the business history and are not replaced
by audit entries.

## Migration and compatibility

Migration `20260831090000_add_task_review_workflow` adds the review enums, task review
fields, round/history tables, relationships, indexes, and uniqueness constraints.
Defaults are `requiresReview = false` and `reviewStatus = NOT_REQUIRED`, so existing
tasks retain their previous completion behavior.

## Known limitations

- Review is single-reviewer; committees and sequential approvals are out of scope.
- There are no digital signatures, threaded review comments, document diffs, or
  structured checklists.
- Submission artifacts must first be linked to the task through the Artifact panel.
- Reviewer change during a pending round is intentionally blocked; submit a decision
  or cancel the task before reconfiguring the reviewer.
