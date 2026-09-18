# Tender workflow (Phase 4.3)

Phase 4.3 extends the existing Technical Center tender lifecycle without synchronizing it with the Opportunity pipeline.

## User-facing process

The detailed fourteen-state lifecycle is presented to users as eight understandable operational steps:

1. Register and identify (`DRAFT`, `IDENTIFIED`)
2. Initial qualification (`QUALIFICATION`)
3. Prepare the response (`PREPARING`)
4. Technical approval (`TECHNICAL_REVIEW`)
5. Commercial approval (`COMMERCIAL_REVIEW`)
6. Final control and submission (`READY_FOR_SUBMISSION`, `SUBMITTED`)
7. Customer evaluation and clarification (`UNDER_EVALUATION`, `CLARIFICATION`)
8. Result and archive (`WON`, `LOST`, `CANCELLED`, `ARCHIVED`)

The UI shows the current operational step, its responsible role, the recommended next action, and the reason any next-state action is disabled. The backend lifecycle remains the authoritative enforcement layer.

## Readiness policy

Readiness is derived on the server and is never persisted. `GET /technical/tenders/:id/readiness` returns `overallReady`, explicit blockers and warnings, and check summaries.

A tender is ready only when:

- the participation decision is `BID` and qualification is `GO` or `CONDITIONAL_GO`;
- every mandatory requirement is `VERIFIED` (mandatory `NOT_APPLICABLE` is not accepted);
- every unresolved mandatory requirement has an owner;
- each required deliverable points to an `APPROVED` or `ACTIVE` Technical Document whose latest available version has an attachment;
- the latest technical review and latest commercial review are both `APPROVED`;
- title, owner, type, company and submission deadline are present;
- the submission deadline has not passed.

Overdue requirements and requirements due after the submission deadline are warnings. They do not mutate dates automatically. A blocked requirement requires a reason and records blocker actor/time. A deliverable is required by default, preserving conservative behavior for existing rows.

The backend enforces readiness on transitions to `READY_FOR_SUBMISSION` and `SUBMITTED`, returning `TENDER_NOT_READY` with machine-readable blocker details.

The transition from `QUALIFICATION` to `PREPARING` is also gated by the same participation/qualification decision. A `NO_BID` or `NO_GO` record should be closed through the cancellation path with an explicit reason instead of progressing into proposal preparation.

## Reviews

Technical and commercial reviews are separate `TenderReview` records. Multiple rounds preserve history; readiness uses the newest review of each type. A pending review cannot be duplicated, a decided review cannot be decided again, and rejection requires a comment.

Review requests and decisions update the Tender revision and Review record in one database transaction. A partial unique index guarantees at most one pending review per tenant/tender/type even under concurrent requests. The hardening migration deterministically cancels only older duplicate pending rounds, if any already exist.

- `technical-tender:review-technical`
- `technical-tender:review-commercial`

No separation-of-duties rule existed in the product, so Phase 4.3 does not silently prohibit requesters from reviewing. This can be introduced as an explicit governance policy later.

## Submit, close and reopen

The existing transition endpoint remains authoritative. Submission requires `technical-tender:submit`, readiness, and records `submittedAt/submittedById`. WON, LOST and CANCELLED require `technical-tender:close` and record `closedAt/closedById`; LOST and CANCELLED require a reason. Controlled backward review transitions require a reason. Optimistic `revision` checking remains active.

## Deadlines

Deadline state is derived. The UI treats a deadline as overdue when it is before now, due today on the same rendered day, and due soon within three days. Server readiness blocks a past submission deadline; technical and expected-decision dates remain informational.

## Audit and notifications

Tender transitions, review requests/decisions, submit/close/reopen, requirement state changes and deliverable removals use the existing tenant audit log. Tender history reads those events through a tender-scoped endpoint.

Existing notifications are used for review requests, review rejection, blocked assigned requirements and submission. Self-notifications are skipped to reduce noise. No scheduler was added for reminders.

## Known limitations / Phase 4.4 handoff

- No Opportunity stage synchronization.
- No automatic Task creation or generic approval engine.
- No scheduled deadline reminders.
- Required deliverables are explicit linked records; the system does not generate a tender-specific deliverable template.
- Review assignment currently accepts a tenant user id; richer role-based reviewer discovery can be added later.
