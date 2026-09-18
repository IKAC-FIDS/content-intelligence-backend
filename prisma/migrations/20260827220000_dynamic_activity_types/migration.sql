BEGIN;

-- Preserve every existing activity code, including system-generated STAGE_CHANGE.
ALTER TABLE "activities" ALTER COLUMN "type" TYPE TEXT USING "type"::text;

INSERT INTO "lookup_options" ("id", "group", "code", "label", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'activity-types', 'CALL', 'تماس تلفنی', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'activity-types', 'EMAIL', 'ایمیل', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'activity-types', 'LINKEDIN_MESSAGE', 'پیام لینکدین', true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'activity-types', 'LINKEDIN_ENGAGEMENT', 'تعامل لینکدین', true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'activity-types', 'MEETING', 'جلسه', true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'activity-types', 'NOTE', 'یادداشت', true, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("group", "code") DO NOTHING;

COMMIT;
