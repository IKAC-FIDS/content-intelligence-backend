-- activity:view remains the personal activity permission. This separate
-- permission grants explicit organization-wide visibility.
INSERT INTO "permissions" (
  "id", "action", "name", "description", "group",
  "isSystem", "isActive", "createdAt", "updatedAt"
)
VALUES (
  gen_random_uuid()::text,
  'activity:view-organization',
  'مشاهده فعالیت‌های سازمان',
  'مشاهده فعالیت‌های همه کاربران سازمان',
  'فعالیت‌ها',
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

-- Preserve the historical organization-wide behavior for the system ADMIN
-- role. Other roles receive it only when explicitly assigned in RBAC.
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
WHERE r."code" = 'ADMIN'
  AND r."isSystem" = true
  AND p."action" = 'activity:view-organization'
ON CONFLICT DO NOTHING;
