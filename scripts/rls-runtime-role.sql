\if :{?runtime_password}
\else
\echo 'STOP: pass --set=runtime_password=... to psql'
\set ON_ERROR_STOP on
SELECT 1 / 0;
\endif

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iam_crm_runtime')
    THEN 'ALTER ROLE iam_crm_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ' || quote_literal(:'runtime_password')
  ELSE 'CREATE ROLE iam_crm_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ' || quote_literal(:'runtime_password')
END
\gexec

GRANT CONNECT ON DATABASE :DBNAME TO iam_crm_runtime;
GRANT USAGE ON SCHEMA public TO iam_crm_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO iam_crm_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO iam_crm_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO iam_crm_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO iam_crm_runtime;

SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin
FROM pg_roles
WHERE rolname = 'iam_crm_runtime';
