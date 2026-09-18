-- fix 000087: first PostgreSQL RLS canary.
-- Runtime role provisioning is intentionally operator-managed; PostgreSQL
-- role names and CREATEROLE authority are environment concerns.

CREATE POLICY "notifications_tenant_select"
ON "notifications"
FOR SELECT
USING (
  "organizationId" = NULLIF(
    current_setting('app.current_organization_id', true),
    ''
  )
);

CREATE POLICY "notifications_tenant_insert"
ON "notifications"
FOR INSERT
WITH CHECK (
  "organizationId" = NULLIF(
    current_setting('app.current_organization_id', true),
    ''
  )
);

CREATE POLICY "notifications_tenant_update"
ON "notifications"
FOR UPDATE
USING (
  "organizationId" = NULLIF(
    current_setting('app.current_organization_id', true),
    ''
  )
)
WITH CHECK (
  "organizationId" = NULLIF(
    current_setting('app.current_organization_id', true),
    ''
  )
);

CREATE POLICY "notifications_tenant_delete"
ON "notifications"
FOR DELETE
USING (
  "organizationId" = NULLIF(
    current_setting('app.current_organization_id', true),
    ''
  )
);

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
