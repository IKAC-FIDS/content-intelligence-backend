type Schema = Record<string, unknown>;

export const RESPONSE_CONTRACT_SCHEMAS: Record<string, Schema> = {
  WorkspaceStatus: { type: 'string', enum: ['ACTIVE', 'ARCHIVED'] },
  Workspace: {
    type: 'object',
    required: [
      'id',
      'organizationId',
      'name',
      'code',
      'status',
      'settings',
      'defaultLanguageCode',
      'timezone',
      'archivedAt',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      id: { type: 'string', format: 'uuid' },
      organizationId: { type: 'string', format: 'uuid' },
      name: { type: 'string', maxLength: 160 },
      code: { type: 'string', maxLength: 80 },
      status: { $ref: '#/components/schemas/WorkspaceStatus' },
      settings: { type: 'object', additionalProperties: true },
      defaultLanguageCode: { type: 'string', nullable: true, maxLength: 35 },
      timezone: { type: 'string', example: 'Asia/Tehran' },
      archivedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
};

export const TYPED_SUCCESS_PAYLOADS: Record<
  string,
  { schema: Schema; paginated?: boolean }
> = {
  'POST /api/workspaces': { schema: { $ref: '#/components/schemas/Workspace' } },
  'GET /api/workspaces': {
    schema: { $ref: '#/components/schemas/Workspace' },
    paginated: true,
  },
  'GET /api/workspaces/{id}': { schema: { $ref: '#/components/schemas/Workspace' } },
  'PATCH /api/workspaces/{id}': { schema: { $ref: '#/components/schemas/Workspace' } },
  'PATCH /api/workspaces/{id}/archive': { schema: { $ref: '#/components/schemas/Workspace' } },
};
