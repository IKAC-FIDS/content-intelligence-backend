# Phase 4.5 — Unified Artifact Management

## Existing implementation reviewed

Before this phase, `FileAttachment` stored uploaded files using a generic
`entityType`/`entityId` pair. `AttachmentsService` already provided tenant and
entity access checks, 25 MB multipart limits, an organization-configured MIME
allowlist, generated storage keys, filename sanitization, SHA-256 calculation,
quota reservations, soft deletion, audited download, and safe content
disposition. Storage was already isolated behind the local/MinIO attachment
storage interface. Opportunity and Meeting had separate frontend attachment
UIs; there was no external-reference model or reusable cross-entity panel.

Phase 4.5 evolves that implementation rather than introducing a parallel file
system. Existing attachment IDs, rows, download URLs and permissions remain
valid.

## Domain model

The Prisma `FileAttachment` model and physical `file_attachments` table are the
canonical Artifact store. New records distinguish:

- `type`: `FILE` or `EXTERNAL_URL`
- `provider`: `LOCAL`, `OBJECT_STORAGE`, `GOOGLE_DRIVE`, `SHAREPOINT`,
  `ONEDRIVE`, `GITHUB`, or `GENERIC_URL`
- searchable core fields: name, description, category, tags, version label and
  confidentiality
- file fields: original/stored filename, MIME type, size, storage reference and
  authoritative server-side SHA-256
- external fields: normalized HTTP(S) URL and optional provider-specific JSON
  metadata

`ArtifactLink` is the generic, tenant-scoped many-to-many link. It stores the
artifact, supported entity type and ID, relation type, creator and timestamp.
The database prevents duplicate artifact/entity/relation triples. Supported
entities are Opportunity, Commercial Document, Payment, Company Legal
Document, Meeting, Technical Document/Resource, Company, Person, Task,
Activity, Product and Organization. The backend verifies supported type,
existence, organization ownership and the caller's entity access before writes.

Relation types are `ATTACHMENT`, `PROPOSAL`, `CONTRACT`,
`TECHNICAL_DOCUMENT`, `MEETING_MINUTES`, `SCREENSHOT`, `EVIDENCE`,
`REFERENCE`, and `OTHER`.

## Upload, storage and integrity

`POST /api/artifacts/upload` uses the established multipart pipeline. It checks
authentication, entity access, organization MIME policy, 25 MB size and a
non-empty body. Storage keys are generated server-side and physical paths are
never returned. SHA-256 is calculated from the received bytes on the server.

The storage write happens first, followed by an Artifact + initial ArtifactLink
database transaction. A failed database operation triggers compensating blob
deletion and quota-reservation release, preventing a committed row that points
to a failed upload and minimizing orphan blobs. The current local/MinIO storage
abstraction remains the default; no infrastructure migration was introduced.

## External references

`POST /api/artifacts/external` accepts a display name, HTTP(S) URL, explicit
provider, description, relation and optional metadata. The URL is parsed,
limited to HTTP(S), normalized and stored without its fragment. The backend
does not fetch the URL, follow redirects or call provider APIs, so registration
does not introduce SSRF behavior.

The UI may infer Google Drive, SharePoint, OneDrive or GitHub from the hostname.
That inference is only assistance: the backend still validates the provider
enum and URL. Where safely derivable in the browser, Google file ID and GitHub
repository/path/ref are submitted as metadata. Cloud references are not synced,
downloaded or permission-checked through provider APIs in this phase; no OAuth
credentials were invented.

## API

- `GET /api/artifacts` — entity-scoped, paginated metadata with type, provider,
  relation, date and name/description/original-filename search filters
- `POST /api/artifacts/upload`
- `POST /api/artifacts/external`
- `GET|PATCH|DELETE /api/artifacts/:id`
- `GET|POST /api/artifacts/:id/links`
- `DELETE /api/artifacts/:id/links/:linkId`
- `GET /api/attachments/:id/download` — retained secure file download endpoint

The list query requires both `entityType` and `entityId`; it never loads every
artifact in the organization. Metadata and links are loaded in one paginated
query, and list rendering never loads file bodies.

## Permissions and audit

New granular permissions are `artifact:view`, `artifact:create`,
`artifact:update`, `artifact:delete`, and `artifact:link`. Controllers also
accept the semantically equivalent legacy `attachment:view` and
`attachment:manage` permissions for backward compatibility. Entity-level and
organization-level checks remain authoritative in services.

Audit events include `artifact.uploaded`, `artifact.external_created`,
`artifact.updated`, `artifact.deleted`, `artifact.linked`, and
`artifact.unlinked`. The retained download flow records
`attachment.downloaded`. Metadata includes IDs, type/provider and link target;
file contents are never logged.

## Delete, unlink and orphan behavior

Unlink deletes only one `ArtifactLink`; the Artifact and its other links remain.
Artifact delete requires delete permission and follows the established soft
delete convention. The stored blob is retained with the soft-deleted row rather
than being immediately destroyed, supporting recovery/retention and avoiding
unsafe deletion while other links exist. Zero-link artifacts may remain in the
library after an explicit unlink; they are not silently deleted. A future
retention job may purge soft-deleted blobs according to an approved policy.

## Migration and compatibility

Migration `20260830233000_add_unified_artifacts` adds Artifact fields and the
link table. It backfills every existing attachment as `FILE`, derives LOCAL or
OBJECT_STORAGE from its current storage provider, derives its display name, and
creates one initial link without changing its ID. Nullable legacy actor IDs are
cleaned only when they reference a missing user before foreign keys are added.
Existing `/attachments` upload/list/download/delete routes remain operational.

## Frontend

The reusable component is used as:

```tsx
<ArtifactPanel entityType="OPPORTUNITY" entityId={opportunity.id} />
```

It provides a permission-aware paginated list, server search, All/File/Link
filters, provider badges, drag/drop or picker upload with progress, external URL
dialog, safe external opening (`noopener,noreferrer`), download, details,
unlink and delete confirmation. Details expose provider, MIME, size, uploader,
date, SHA-256, description and all links. It is integrated into Opportunity,
Company, Task and Meeting detail views. Person currently has only a transient
360 dialog rather than a stable routed detail page, so integration there is
intentionally deferred. Browser-native open/download behavior is retained; no
heavy preview dependency was added. The current HTTP client has no upload abort
contract, so the dialog reports progress but does not present a misleading
cancel-in-flight control.
