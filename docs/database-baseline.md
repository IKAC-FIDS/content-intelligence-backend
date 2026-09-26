# Content Intelligence database baseline

The repository has one clean migration for new installations:

`20260926000000_initial_content_intelligence_foundation`

It creates the current platform Foundation directly. It does not replay the retired IAM CRM, Technical Center, Tender, notification, or conversation schema history.

## New empty database

Use a database dedicated to Content Intelligence and apply migrations with the production path:

```bash
npx prisma migrate deploy
npm run seed
```

The Foundation Seed creates system permissions and the protected tenant `ADMIN` role. Tenant, User, Membership, and Platform Admin provisioning remain explicit operator actions.

Never use `prisma migrate reset` or `prisma db push --force-reset` on a persistent environment.

## Existing deployed database

The deployed Content Intelligence database previously applied the retired 80-migration history and contains Foundation state that must be preserved. Do not execute the initial baseline SQL against it and do not delete or edit `_prisma_migrations` rows.

Before deploying a build that contains the clean baseline:

1. Take and verify a database backup scoped to the Content Intelligence database.
2. Stop only the Content Intelligence API to prevent concurrent writes.
3. Verify the target database name and confirm it is not the CRM database.
4. Inventory `_prisma_migrations` names and confirm the old history is present.
5. Verify every Foundation table required by `prisma/schema.prisma` exists. Extra retired tables and extra PostgreSQL enum values may remain until a separately reviewed archival migration.
6. Build the new API image, but do not start it yet because container startup runs `prisma migrate deploy`.
7. Use Prisma's supported baseline mechanism to record the clean baseline as applied without executing its SQL:

   ```bash
   docker compose --env-file .env.server -f docker-compose.server.yml run --rm -T --no-deps api \
     sh -c 'DATABASE_URL="$MIGRATION_DATABASE_URL" npx prisma migrate resolve --applied 20260926000000_initial_content_intelligence_foundation'
   ```

8. Run `prisma migrate status`, then `prisma migrate deploy`. Deploy must report no pending migration and must not attempt any Foundation `CREATE TABLE` statement.
9. Start the API and validate `/api/health`, `/api/ready`, login, tenant resolution, and Platform Admin access.

The `migrate resolve` step changes only Prisma migration metadata through Prisma's supported command. It does not reconcile schema drift or remove legacy tables. Run it only after the backup and Foundation-table verification are complete.

## CRM isolation

The Content Intelligence and IAM CRM databases are separate logical databases in the shared PostgreSQL instance. Every command must target only the Content Intelligence database. Instance-wide drop, schema drop, and commands against the CRM database are prohibited.
