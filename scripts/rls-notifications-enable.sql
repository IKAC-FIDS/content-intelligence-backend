-- Re-enable the reviewed fix 000087 canary after the incident is resolved.
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

SELECT relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE oid = 'public.notifications'::regclass;
