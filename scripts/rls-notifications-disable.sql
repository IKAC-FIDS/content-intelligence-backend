-- Non-destructive fix 000087 kill switch. Application Tenant Scope remains.
ALTER TABLE "notifications" DISABLE ROW LEVEL SECURITY;

SELECT relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE oid = 'public.notifications'::regclass;
