-- Ensure Teams module permissions exist and are assigned to intended roles.

INSERT INTO "permissions" ("id", "action", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'team:view', 'مشاهده تیم‌ها', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'team:manage', 'مدیریت تیم‌ها', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("action") DO UPDATE
SET
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("id", "role", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'ADMIN'::"UserRole", p."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "permissions" p
WHERE p."action" IN ('team:view', 'team:manage')
ON CONFLICT ("role", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'MANAGER'::"UserRole", p."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "permissions" p
WHERE p."action" = 'team:view'
ON CONFLICT ("role", "permissionId") DO NOTHING;
