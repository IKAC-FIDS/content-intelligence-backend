import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Operation = { operationId?: string; description?: string; security?: unknown[]; responses?: Record<string, any>; requestBody?: any };
type Contract = { openapi: string; paths: Record<string, Record<string, Operation>>; components: any };
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const load = (): Contract => JSON.parse(readFileSync(resolve('openapi/openapi.json'), 'utf8'));
const operations = (doc: Contract) => Object.entries(doc.paths).flatMap(([path, item]) => Object.entries(item).filter(([method]) => methods.has(method)).map(([method, operation]) => ({ path, method, operation })));

describe('fix 000094 canonical OpenAPI contract', () => {
  const doc = load();
  const ops = operations(doc);

  it('documents every current HTTP operation with stable unique IDs', () => {
    expect(ops).toHaveLength(465);
    const ids = ops.map(({ operation }) => operation.operationId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps critical routes and does not introduce /v1', () => {
    for (const path of ['/api/health', '/api/auth/login', '/api/companies', '/api/opportunities', '/api/quota/current', '/api/admin/plans/{planId}/quotas']) expect(doc.paths[path]).toBeDefined();
    expect(Object.keys(doc.paths).some((path) => path.startsWith('/v1') || path.startsWith('/api/v1'))).toBe(false);
  });

  it('defines security, success/error envelopes, request ID and pagination', () => {
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(doc.components.schemas.SuccessEnvelope.properties.requestId.type).toBe('string');
    expect(doc.components.schemas.ErrorEnvelope.properties.error.properties.code.type).toBe('string');
    expect(doc.components.schemas.PaginationMeta.required).toContain('total');
    const enveloped = ops.filter(({ operation }) => operation.responses?.['200']?.content?.['application/json'] || operation.responses?.['201']?.content?.['application/json']);
    expect(enveloped.every(({ operation }) => operation.responses?.['400'] && operation.responses?.['401'] && operation.responses?.['403'] && operation.responses?.['404'] && operation.responses?.['409'] && operation.responses?.['429'])).toBe(true);
  });

  it('represents quota BigInt values as decimal strings and QUOTA_EXCEEDED', () => {
    expect(doc.components.schemas.DecimalIntegerString.type).toBe('string');
    const quota = JSON.stringify(doc.paths['/api/quota/current']);
    expect(quota).toContain('QuotaSummary');
    expect(quota).toContain('QUOTA_EXCEEDED');
  });

  it('keeps representative class-validator and OpenAPI DTO metadata aligned', () => {
    expect(doc.components.schemas.LoginDto.required).toEqual(['email', 'password']);
    expect(doc.components.schemas.LoginDto.properties.email.format).toBe('email');
    expect(doc.components.schemas.LoginDto.properties.password.writeOnly).toBe(true);
    expect(doc.components.schemas.SwitchTenantDto.properties.organizationId.format).toBe('uuid');
  });

  it('documents public and protected security accurately', () => {
    expect(doc.components.securitySchemes.refreshCookie.name).toBe('refreshToken');
    expect(doc.paths['/api/health'].get.security).toEqual([]);
    expect(doc.paths['/api/auth/login'].post.security).toEqual([]);
    expect(doc.paths['/api/auth/sso/providers'].get.security).toEqual([]);
    expect(doc.paths['/api/auth/refresh'].post.security).toEqual([{ refreshCookie: [] }]);
    expect(doc.paths['/api/companies'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.paths['/api/admin/plans/{planId}/quotas'].get.description).toContain('PlatformAdmin-only');
  });

  it('documents multipart upload without storage internals', () => {
    const body = doc.paths['/api/attachments'].post.requestBody;
    expect(body.content['multipart/form-data'].schema.properties.file.format).toBe('binary');
    expect(JSON.stringify(body)).not.toMatch(/bucket|objectKey|secret/i);
  });

  it('does not reference credential-bearing schemas from responses', () => {
    for (const { operation } of ops) {
      const responses = JSON.stringify(operation.responses);
      expect(responses).not.toMatch(/passwordHash|refreshToken|clientSecret|privateKey|secretKey|accessToken|objectKey|DATABASE_URL|MINIO_SECRET|JWT_SECRET/);
    }
  });

  it('uses only synthetic examples', () => {
    const json = JSON.stringify(doc);
    expect(json).not.toMatch(/@[a-z0-9.-]+\.(com|ir)\b/i);
    expect(json).not.toContain('MIGRATION_DATABASE_URL');
  });
});
