# Content Intelligence server deployment

This deployment reuses the existing PostgreSQL and MinIO containers. Do not run
the development `docker-compose.yml` on the shared server because it publishes
ports 15432, 9000, 9001, and 3000 that are already occupied.

## One-time server preparation

Discover the existing database network and confirm that both shared services can
join it:

```bash
docker inspect iam-crm-backend-db-1 \
  --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{println}}{{end}}'
docker network inspect iam-crm-backend_default >/dev/null
docker network connect iam-crm-backend_default iam-crm-minio 2>/dev/null || true
```

Copy `.env.server.example` to `.env.server`, replace every `CHANGE_ME` and
`SERVER_IP_OR_DOMAIN`, and keep that file outside Git. Inside Docker, PostgreSQL
uses `iam-crm-backend-db-1:5432` and MinIO uses `iam-crm-minio:9000`.

## Validate before starting

```bash
docker compose --env-file .env.server -f docker-compose.server.yml config --quiet
docker ps --format '{{.Names}} {{.Ports}}'
docker network inspect iam-crm-backend_default \
  --format '{{range .Containers}}{{println .Name}}{{end}}'
```

The shared network must list `iam-crm-backend-db-1` and `iam-crm-minio`. Port
3001 must be free. The existing CRM services remain running.

## Build and start only Content Intelligence

```bash
docker compose --env-file .env.server -f docker-compose.server.yml build api
docker compose --env-file .env.server -f docker-compose.server.yml up -d api
docker compose --env-file .env.server -f docker-compose.server.yml ps
docker compose --env-file .env.server -f docker-compose.server.yml logs --tail=200 api
curl --fail http://127.0.0.1:3001/api/health
curl --fail http://127.0.0.1:3001/api/ready
```

The image runs `prisma migrate deploy` with `MIGRATION_DATABASE_URL` before
starting Node with `DATABASE_URL`. Never use `docker compose down -v`, remove the
shared network, or recreate the existing PostgreSQL and MinIO containers.

An existing Content Intelligence deployment that recorded the retired
CRM-derived migration history must complete the backup-gated, one-time baseline
reconciliation in [database-baseline.md](database-baseline.md) before starting
an image containing the clean baseline. The baseline SQL is only for an empty
database and must not be executed against the existing deployment.
