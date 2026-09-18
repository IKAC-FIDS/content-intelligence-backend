import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { hashSync } from 'bcryptjs';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { RefreshTokenService } from '../src/auth/refresh-token.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { TenantResolverService } from '../src/organization-memberships/tenant-resolver.service';
import { AuditRequestContextService } from '../src/audit-log/audit-request-context.service';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { ApiResponseInterceptor } from '../src/common/interceptors/api-response.interceptor';
import { buildRefreshTokenCookieOptions } from '../src/common/cookies/refresh-token-cookie';

// HTTP/controller/service integration with synthetic persistence. No environment DB connection.
describe('auth HTTP session contract', () => {
  let app: INestApplication;
  const env = { ...process.env };
  const user = { id: 'user-test', fullName: 'Synthetic', email: 'user@example.test', role: 'REP', roleId: null, isActive: true, passwordHash: hashSync('synthetic-password', 4), failedLoginAttempts: 0 };
  const rows = new Map<string, any>();
  const tenant = { organizationId: 'tenant-test', membershipId: 'membership-test', role: 'REP', roleId: null, permissions: [], userId: user.id };
  const resolver = { resolveAuthenticatedTenant: jest.fn(async () => tenant), selectTenant: jest.fn(async () => ({ ...tenant, organizationId: 'tenant-next' })) };
  const config = new ConfigService({ JWT_SECRET: 'synthetic-test-secret-at-least-32-characters' });
  const jwt = new JwtService({ secret: config.get('JWT_SECRET'), signOptions: { expiresIn: '15m' } });
  const matches = (row: any, where: any): boolean => Object.entries(where).every(([key, value]: [string, any]) => {
    if (value && typeof value === 'object' && 'gt' in value) return row[key] > value.gt;
    if (value && typeof value === 'object' && 'not' in value) return row[key] !== value.not;
    return row[key] === value;
  });
  const prisma: any = {
    user: { findUnique: jest.fn(async ({ where }: any) => where.email === user.email || where.id === user.id ? { ...user } : null), update: jest.fn(async () => user) },
    role: { findUnique: jest.fn(async () => null) },
    organizationSettings: { findUnique: jest.fn(async () => null) },
    refreshSession: {
      findUnique: jest.fn(async ({ where }: any) => { const row = [...rows.values()].find(r => matches(r, where)); return row ? { ...row, user: { ...user } } : null; }),
      create: jest.fn(async ({ data }: any) => { const row = { id: `session-${rows.size}`, revokedAt: null, ...data }; rows.set(row.id, row); return { ...row }; }),
      updateMany: jest.fn(async ({ where, data }: any) => { let count = 0; for (const row of rows.values()) if (matches(row, where)) { Object.assign(row, data); count++; } return { count }; }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(rows.get(where.id), data)),
    },
  };
  let transactions = Promise.resolve();
  prisma.$transaction = (fn: (tx: any) => Promise<unknown>) => {
    const result = transactions.then(() => fn(prisma));
    transactions = result.then(() => undefined, () => undefined);
    return result;
  };
  const refresh = new RefreshTokenService(prisma, config);
  const service = new AuthService(prisma, jwt, refresh, config, { touchLastAccess: async () => undefined } as any, resolver as any, { record: async () => undefined } as any);
  @Module({ imports: [PassportModule], controllers: [AuthController], providers: [
    { provide: AuthService, useValue: service }, JwtStrategy,
    { provide: ConfigService, useValue: config },
    { provide: TenantResolverService, useValue: resolver },
    { provide: AuditRequestContextService, useValue: { setOrganizationId() {}, setActor() {} } },
  ] })
  class TestModule {}
  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://crm.example.test';
    process.env.REFRESH_TOKEN_COOKIE_SECURE = 'true';
    process.env.REFRESH_TOKEN_COOKIE_SAME_SITE = 'lax';
    process.env.REFRESH_TOKEN_COOKIE_PATH = '/api/auth';
    app = await NestFactory.create(TestModule, { logger: false });
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.init();
  });
  beforeEach(() => { rows.clear(); user.isActive = true; resolver.resolveAuthenticatedTenant.mockImplementation(async () => tenant); });
  afterAll(async () => { await app.close(); process.env = env; });
  const post = (path: string) => request(app.getHttpServer()).post(`/api/auth/${path}`).set('Origin', 'https://crm.example.test');
  const login = () => post('login').send({ email: user.email, password: 'synthetic-password' });
  const cookie = (response: any) => response.headers['set-cookie'][0].split(';')[0];
  it('login sets an HttpOnly secure cookie and returns only public credentials', async () => {
    const response = await login().expect(200);
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.user.id).toBe(user.id);
    expect(response.body.data).not.toHaveProperty('refreshToken');
    expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(response.headers['set-cookie'][0]).toMatch(/Secure/);
    expect(response.headers['set-cookie'][0]).toMatch(/SameSite=Lax/);
    expect(response.headers['set-cookie'][0]).toMatch(/Path=\/api\/auth/);
  });
  it('wrong credentials return the stable 401 error envelope', async () => {
    const response = await post('login').send({ email: user.email, password: 'incorrect-password' }).expect(401);
    expect(response.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' }, statusCode: 401 });
    expect(response.headers['set-cookie']).toBeUndefined();
  });
  it('rejects refresh without cookie', async () => { await post('refresh').expect(401); });
  it('rotates the cookie and detects later replay by revoking active sessions', async () => {
    const first = await login();
    const second = await post('refresh').set('Cookie', cookie(first)).expect(200);
    expect(cookie(second)).not.toBe(cookie(first));
    expect(second.body.data.accessToken).toBeTruthy();
    expect(second.body.data).not.toHaveProperty('refreshToken');
    await post('refresh').set('Cookie', cookie(first)).expect(401);
    expect([...rows.values()].some(row => row.revokedReason === 'REUSE_DETECTED')).toBe(true);
    await post('refresh').set('Cookie', cookie(second)).expect(401);
  });
  it('defines uncoordinated concurrency: never issues two replacements for one token', async () => {
    const first = await login();
    const results = await Promise.all([post('refresh').set('Cookie', cookie(first)), post('refresh').set('Cookie', cookie(first))]);
    expect(results.map(r => r.status).sort()).toEqual([200, 401]);
    expect(rows.size).toBe(2);
  });
  it('browser-coordinated requests both succeed using the latest cookie', async () => {
    const first = await login();
    const tabA = await post('refresh').set('Cookie', cookie(first)).expect(200);
    await post('refresh').set('Cookie', cookie(tabA)).expect(200);
    expect([...rows.values()].filter(row => !row.revokedAt)).toHaveLength(1);
  });
  it('logout revokes the session and clears matching cookie attributes', async () => {
    const first = await login();
    const response = await post('logout').set('Cookie', cookie(first)).expect(200);
    expect(response.headers['set-cookie'][0]).toMatch(/^refreshToken=;/);
    expect(response.headers['set-cookie'][0]).toMatch(/Path=\/api\/auth;.*HttpOnly; Secure; SameSite=Lax/);
    await post('refresh').set('Cookie', cookie(first)).expect(401);
  });
  it('logout-all requires Bearer and revokes every user session', async () => {
    const first = await login();
    await login();
    await post('logout-all').expect(401);
    const response = await post('logout-all').set('Authorization', `Bearer ${first.body.data.accessToken}`).expect(200);
    expect(response.body.revokedCount).toBe(2);
    expect([...rows.values()].every(row => row.revokedAt)).toBe(true);
  });
  it('disabled accounts cannot refresh', async () => {
    const first = await login(); user.isActive = false;
    await post('refresh').set('Cookie', cookie(first)).expect(401);
  });
  it('switch-tenant preserves the public response, authorization and rotation contract', async () => {
    const first = await login();
    const response = await post('switch-tenant')
      .set('Authorization', `Bearer ${first.body.data.accessToken}`)
      .set('Cookie', cookie(first))
      .send({ organizationId: '00000000-0000-4000-8000-000000000002' }).expect(200);
    expect(response.body.data.user.organizationId).toBe('tenant-next');
    expect(response.body.data).not.toHaveProperty('refreshToken');
    expect(cookie(response)).not.toBe(cookie(first));
  });
  it.each(['https://evil.example.test', 'null', undefined])('rejects untrusted/missing Origin %s before cookie mutation', async origin => {
    const first = await login();
    const req = request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie(first));
    if (origin) req.set('Origin', origin);
    const response = await req.expect(403);
    expect(response.body.error.code).toBe('AUTH_ORIGIN_REJECTED');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect([...rows.values()].every(row => !row.revokedAt)).toBe(true);
  });
  it('production fails fast for unsafe cookie configuration', () => {
    process.env.REFRESH_TOKEN_COOKIE_SECURE = 'false';
    expect(() => buildRefreshTokenCookieOptions()).toThrow();
    process.env.REFRESH_TOKEN_COOKIE_SECURE = 'true';
  });
});
