type Schema = Record<string, unknown>;

export const RESPONSE_CONTRACT_SCHEMAS: Record<string, Schema> = {
  LanguageDirection: { type: 'string', enum: ['LTR', 'RTL'] },
  Language: {
    type: 'object', required: ['id', 'code', 'name', 'nativeName', 'direction', 'isActive', 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string', format: 'uuid' }, code: { type: 'string', maxLength: 35 }, name: { type: 'string', maxLength: 120 },
      nativeName: { type: 'string', maxLength: 120 }, direction: { $ref: '#/components/schemas/LanguageDirection' }, isActive: { type: 'boolean' },
      createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  IntelligenceDomain: {
    type: 'object', required: ['id', 'code', 'name', 'description', 'isActive', 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string', format: 'uuid' }, code: { type: 'string', maxLength: 80 }, name: { type: 'string', maxLength: 160 },
      description: { type: 'string', maxLength: 1000, nullable: true }, isActive: { type: 'boolean' },
      createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  TopicAlias: {
    type: 'object', required: ['id', 'value', 'normalizedValue', 'languageId', 'language', 'createdAt', 'updatedAt'],
    properties: { id: { type: 'string', format: 'uuid' }, value: { type: 'string' }, normalizedValue: { type: 'string' }, languageId: { type: 'string', format: 'uuid', nullable: true }, language: { type: 'object', allOf: [{ $ref: '#/components/schemas/Language' }], nullable: true }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } },
  },
  Topic: {
    type: 'object', required: ['id', 'code', 'name', 'description', 'isActive', 'domains', 'aliases', 'createdAt', 'updatedAt'],
    properties: { id: { type: 'string', format: 'uuid' }, code: { type: 'string', maxLength: 100 }, name: { type: 'string', maxLength: 200 }, description: { type: 'string', nullable: true }, isActive: { type: 'boolean' }, domains: { type: 'array', items: { $ref: '#/components/schemas/IntelligenceDomain' } }, aliases: { type: 'array', items: { $ref: '#/components/schemas/TopicAlias' } }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } },
  },
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
      'defaultLanguageId', 'defaultLanguage', 'inputLanguages', 'outputLanguages', 'domains', 'topics',
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
      defaultLanguageId: { type: 'string', format: 'uuid', nullable: true },
      defaultLanguage: { type: 'object', allOf: [{ $ref: '#/components/schemas/Language' }], nullable: true },
      inputLanguages: { type: 'array', items: { $ref: '#/components/schemas/Language' } },
      outputLanguages: { type: 'array', items: { $ref: '#/components/schemas/Language' } },
      domains: { type: 'array', items: { $ref: '#/components/schemas/IntelligenceDomain' } },
      topics: { type: 'array', items: { $ref: '#/components/schemas/Topic' } },
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
  'GET /api/languages': { schema: { $ref: '#/components/schemas/Language' }, paginated: true },
  'GET /api/admin/languages': { schema: { $ref: '#/components/schemas/Language' }, paginated: true },
  'GET /api/admin/languages/{id}': { schema: { $ref: '#/components/schemas/Language' } },
  'POST /api/admin/languages': { schema: { $ref: '#/components/schemas/Language' } },
  'PATCH /api/admin/languages/{id}': { schema: { $ref: '#/components/schemas/Language' } },
  'PATCH /api/admin/languages/{id}/activate': { schema: { $ref: '#/components/schemas/Language' } },
  'PATCH /api/admin/languages/{id}/deactivate': { schema: { $ref: '#/components/schemas/Language' } },
  'GET /api/intelligence-domains': { schema: { $ref: '#/components/schemas/IntelligenceDomain' }, paginated: true },
  'GET /api/admin/intelligence-domains': { schema: { $ref: '#/components/schemas/IntelligenceDomain' }, paginated: true },
  'GET /api/admin/intelligence-domains/{id}': { schema: { $ref: '#/components/schemas/IntelligenceDomain' } },
  'POST /api/admin/intelligence-domains': { schema: { $ref: '#/components/schemas/IntelligenceDomain' } },
  'PATCH /api/admin/intelligence-domains/{id}': { schema: { $ref: '#/components/schemas/IntelligenceDomain' } },
  'PATCH /api/admin/intelligence-domains/{id}/activate': { schema: { $ref: '#/components/schemas/IntelligenceDomain' } },
  'PATCH /api/admin/intelligence-domains/{id}/deactivate': { schema: { $ref: '#/components/schemas/IntelligenceDomain' } },
  'GET /api/topics': { schema: { $ref: '#/components/schemas/Topic' }, paginated: true },
  'GET /api/admin/topics': { schema: { $ref: '#/components/schemas/Topic' }, paginated: true },
  'GET /api/admin/topics/{id}': { schema: { $ref: '#/components/schemas/Topic' } },
  'POST /api/admin/topics': { schema: { $ref: '#/components/schemas/Topic' } },
  'PATCH /api/admin/topics/{id}': { schema: { $ref: '#/components/schemas/Topic' } },
  'PATCH /api/admin/topics/{id}/activate': { schema: { $ref: '#/components/schemas/Topic' } },
  'PATCH /api/admin/topics/{id}/deactivate': { schema: { $ref: '#/components/schemas/Topic' } },
};
