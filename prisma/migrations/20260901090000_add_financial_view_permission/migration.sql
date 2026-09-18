-- Financial visibility is an explicit effective permission. Existing
-- production installations receive it without requiring a full seed run.
INSERT INTO "permissions" (
  "id", "action", "name", "description", "group",
  "isSystem", "isActive", "createdAt", "updatedAt"
)
VALUES (
  gen_random_uuid()::text,
  'financial:view',
  'مشاهده اطلاعات مالی',
  'مشاهده اطلاعات مالی',
  'اطلاعات مالی',
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("action") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "group" = EXCLUDED."group",
  "isSystem" = true,
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" (
  "id", "role", "roleId", "permissionId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  r."baseRole",
  r."id",
  p."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" IN ('ADMIN', 'MANAGER', 'BOARDS')
  AND r."isSystem" = true
  AND p."action" = 'financial:view'
ON CONFLICT DO NOTHING;
