import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('typed OpenAPI response contracts', () => {
  const document: any = JSON.parse(readFileSync(resolve('openapi/openapi.json'), 'utf8'));

  const cases = [
    ['get', '/api/companies', '200', 'CompanyListItem', true],
    ['post', '/api/companies', '201', 'CompanyResponse', false],
    ['get', '/api/companies/{id}', '200', 'CompanyResponse', false],
    ['patch', '/api/companies/{id}', '200', 'CompanyResponse', false],
    ['get', '/api/tasks', '200', 'TaskResponse', true],
    ['post', '/api/tasks', '201', 'TaskResponse', false],
    ['get', '/api/tasks/{id}', '200', 'TaskResponse', false],
    ['patch', '/api/tasks/{id}', '200', 'TaskResponse', false],
    ['delete', '/api/tasks/{id}', '200', 'DeletedTaskResponse', false],
  ] as const;

  it.each(cases)('%s %s has a concrete success contract', (method, path, status, model, paginated) => {
    const schema = document.paths[path][method].responses[status].content['application/json'].schema;
    const overlay = schema.allOf[1];
    expect(overlay.properties.data).toEqual(paginated
      ? { type: 'array', items: { $ref: `#/components/schemas/${model}` } }
      : { $ref: `#/components/schemas/${model}` });
    expect(JSON.stringify(schema)).not.toContain('"additionalProperties":true');
    if (paginated) expect(overlay.properties.meta.$ref).toBe('#/components/schemas/PaginationMeta');
  });

  it('models representative errors, nullable fields, and enums explicitly', () => {
    const operation = document.paths['/api/tasks/{id}'].get;
    expect(operation.responses['400'].content['application/json'].schema.$ref).toBe('#/components/schemas/ErrorEnvelope');
    expect(operation.responses['404'].content['application/json'].schema.$ref).toBe('#/components/schemas/ErrorEnvelope');
    expect(document.components.schemas.TaskResponse.properties.dueAt).toMatchObject({ nullable: true, format: 'date-time' });
    expect(document.components.schemas.TaskResponse.properties.status.enum).toEqual(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']);
    expect(document.components.schemas.PaginationMeta.required).toEqual(['total', 'page', 'limit', 'totalPages', 'hasNext', 'hasPrevious']);
  });
});
