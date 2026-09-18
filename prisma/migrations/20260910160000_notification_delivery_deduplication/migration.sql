-- Add an explicit tenant boundary to delivery uniqueness without rewriting history.
ALTER TABLE "notification_deliveries" ADD COLUMN "organizationId" TEXT;

UPDATE "notification_deliveries" AS delivery
SET "organizationId" = event."organizationId"
FROM "notification_events" AS event
WHERE event."id" = delivery."eventId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "notification_deliveries" WHERE "organizationId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot tenant-scope notification deliveries with missing parent events';
  END IF;
END $$;

ALTER TABLE "notification_deliveries" ALTER COLUMN "organizationId" SET NOT NULL;
DROP INDEX "notification_deliveries_deduplicationKey_key";
CREATE UNIQUE INDEX "notification_deliveries_organizationId_deduplicationKey_key"
  ON "notification_deliveries"("organizationId", "deduplicationKey");
CREATE INDEX "notification_deliveries_organizationId_status_createdAt_idx"
  ON "notification_deliveries"("organizationId", "status", "createdAt");

ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DROP POLICY "notification_deliveries_tenant_isolation" ON "notification_deliveries";
CREATE POLICY "notification_deliveries_tenant_isolation" ON "notification_deliveries"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (
    "organizationId" = current_setting('app.current_organization_id', true)
    AND EXISTS (
      SELECT 1 FROM "notification_events" AS event
      WHERE event."id" = "notification_deliveries"."eventId"
        AND event."organizationId" = "notification_deliveries"."organizationId"
    )
  );
