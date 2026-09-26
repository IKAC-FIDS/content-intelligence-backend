# Content Intelligence Backend

Multi-tenant NestJS foundation for the Content Intelligence platform.

## Foundation capabilities

- Password, refresh-session, passkey, OIDC, and SAML authentication
- Tenant membership and tenant-scoped RBAC
- Independent platform-admin authority
- Tenant teams, settings, branding, and verified domains
- Plans, entitlements, quotas, and usage accounting
- Audit logging and local/MinIO profile-media storage
- Health, readiness, and canonical OpenAPI endpoints

CRM sales, opportunity, task, meeting, notification, technical-center, and tender domains were retired in Stage 5.8. Future Content Intelligence domains should be introduced as independent modules on top of this foundation.

## Local setup

```bash
npm ci
npx prisma generate
npm run build
npm test
npm run start:dev
```

Copy `.env.example` to `.env` and set at least `DATABASE_URL`, `JWT_SECRET`, and the allowed origin values before starting the API.

The Foundation Seed synchronizes only required system metadata: retained API permissions and the protected tenant `ADMIN` role with its permission mappings. It does not create a tenant, user, membership, Team, Platform Admin, plan, entitlement, quota, SSO provider, or demo data.

```bash
npm run seed
```

Create tenants through the platform organization provisioning API. Grant Platform Admin authority separately with the reviewed `platform-admin:grant` maintenance command; the seed never accepts or creates default credentials.

## Validation

```bash
npm run build
npm test
npm run lint
npm run openapi:check
npm run safety:scan-migrations
```

## Database baseline

New installations apply the single clean Content Intelligence Foundation baseline and then run the Foundation Seed. Existing deployments that recorded the retired migration history must follow the reviewed reconciliation procedure before starting an image containing the new baseline. See [docs/database-baseline.md](docs/database-baseline.md). Never run `prisma migrate reset` or force-reset a persistent database.

## Server deployment

See [docs/content-intelligence-server-deployment.md](docs/content-intelligence-server-deployment.md). The production compose deployment uses the shared PostgreSQL and MinIO services described there.

Useful health endpoints:

- `GET /api/health`
- `GET /api/ready`
- `GET /api/version`
