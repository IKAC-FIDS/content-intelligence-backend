INSERT INTO "lookup_options" ("id", "group", "code", "label", "description", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'meeting-types', 'SALES_MEETING', 'جلسه فروش', NULL, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting-types', 'DEMO', 'جلسه دمو', NULL, true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting-types', 'TECHNICAL_MEETING', 'جلسه فنی', NULL, true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting-types', 'SITE_VISIT', 'بازدید سایت', NULL, true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting-types', 'PERIODIC_VISIT', 'بازدید دوره‌ای', NULL, true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting-types', 'NEEDS_ASSESSMENT', 'جلسه نیازسنجی', NULL, true, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting-types', 'POC_SESSION', 'جلسه POC / Pilot', NULL, true, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting-types', 'INSTALLATION', 'جلسه نصب و راه‌اندازی', NULL, true, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting-types', 'TRAINING', 'جلسه آموزش', NULL, true, 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting-types', 'UAT', 'جلسه تست پذیرش', NULL, true, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting-types', 'ACCEPTANCE', 'جلسه تحویل و پذیرش', NULL, true, 110, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting-types', 'SUPPORT', 'جلسه پشتیبانی', NULL, true, 120, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting-types', 'INTERNAL', 'جلسه داخلی', NULL, true, 130, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting-types', 'OTHER', 'سایر', NULL, true, 140, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("group", "code") DO NOTHING;

ALTER TABLE "meetings" ADD COLUMN "meetingTypeId" TEXT;
UPDATE "meetings" SET "meetingTypeId" = (SELECT "id" FROM "lookup_options" WHERE "group" = 'meeting-types' AND "code" = 'OTHER' LIMIT 1);
ALTER TABLE "meetings" ALTER COLUMN "meetingTypeId" SET NOT NULL;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_meetingTypeId_fkey" FOREIGN KEY ("meetingTypeId") REFERENCES "lookup_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "meetings_meetingTypeId_startAt_idx" ON "meetings"("meetingTypeId", "startAt");
