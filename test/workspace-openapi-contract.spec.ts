import { readFileSync } from 'node:fs';

describe('Workspace OpenAPI contract', () => {
  const document = JSON.parse(readFileSync('openapi/openapi.json', 'utf8'));

  it('publishes every Workspace operation with the Workspaces tag', () => {
    const operations: Array<[string, string]> = [
      ['/api/workspaces', 'get'],
      ['/api/workspaces', 'post'],
      ['/api/workspaces/{id}', 'get'],
      ['/api/workspaces/{id}', 'patch'],
      ['/api/workspaces/{id}/archive', 'patch'],
    ];
    for (const [path, method] of operations) {
      expect(document.paths[path]?.[method]).toBeDefined();
      expect(document.paths[path][method].tags).toEqual(['Workspaces']);
      expect(document.paths[path][method].security).toEqual([{ bearerAuth: [] }]);
    }
  });

  it('documents the typed Workspace lifecycle and tenant-owned response', () => {
    expect(document.components.schemas.WorkspaceStatus.enum).toEqual(['ACTIVE', 'ARCHIVED']);
    expect(document.components.schemas.Workspace.properties.organizationId).toEqual({
      format: 'uuid',
      type: 'string',
    });
    expect(
      document.paths['/api/workspaces'].get.responses['200'].content['application/json'].schema.allOf[1]
        .properties.data.items.$ref,
    ).toBe('#/components/schemas/Workspace');
  });

  it('does not accept organizationId in the create request body', () => {
    const schema = document.components.schemas.CreateWorkspaceDto;
    expect(schema.properties).not.toHaveProperty('organizationId');
  });
});
