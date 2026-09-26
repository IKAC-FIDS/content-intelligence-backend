import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('typed foundation OpenAPI response contracts', () => {
  const document: any = JSON.parse(
    readFileSync(resolve('openapi/openapi.json'), 'utf8'),
  );

  const cases = [
    ['post', '/api/auth/login'],
    ['get', '/api/users'],
    ['get', '/api/organization/branding'],
    ['get', '/api/quota/current'],
  ] as const;

  it.each(cases)('%s %s uses the canonical success envelope', (method, path) => {
    const responses = document.paths[path][method].responses;
    const success = Object.entries<any>(responses).find(([status]) =>
      status.startsWith('2'),
    )?.[1];
    const schema = success.content['application/json'].schema;
    expect(schema.allOf[0].$ref).toBe('#/components/schemas/SuccessEnvelope');
    expect(schema.allOf[1].properties.data).toBeDefined();
  });

  it('models foundation errors and pagination explicitly', () => {
    const operation = document.paths['/api/users'].get;
    expect(
      operation.responses['400'].content['application/json'].schema.$ref,
    ).toBe('#/components/schemas/ErrorEnvelope');
    expect(
      operation.responses['401'].content['application/json'].schema.$ref,
    ).toBe('#/components/schemas/ErrorEnvelope');
    expect(document.components.schemas.PaginationMeta.required).toEqual([
      'total',
      'page',
      'limit',
      'totalPages',
      'hasNext',
      'hasPrevious',
    ]);
  });
});
