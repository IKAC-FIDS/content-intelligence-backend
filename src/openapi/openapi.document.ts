import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { FeatureKey, OrganizationStatus, QuotaMetric, QuotaResetPeriod, SubscriptionStatus, UserRole } from '@prisma/client';
import { QUOTA_CONFIGURATION_STATES } from '../quota/quota-resolver.service';
import { OPENAPI_TITLE, OPENAPI_VERSION } from './openapi.constants';
import { RESPONSE_CONTRACT_SCHEMAS, TYPED_SUCCESS_PAYLOADS } from './response-contract.schemas';

type JsonObject = Record<string, any>;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;
const PUBLIC_OPERATIONS = new Set([
  'GET /api/health',
  'POST /api/auth/login',
  'GET /api/auth/sso/providers',
  'POST /api/auth/sso/exchange',
  'GET /api/auth/oidc/:providerId/login',
  'GET /api/auth/oidc/:providerId/callback',
  'GET /api/auth/saml/:providerId/login',
  'POST /api/auth/saml/:providerId/acs',
  'GET /api/auth/saml/:providerId/metadata',
  'POST /api/auth/passkeys/authentication/options',
  'POST /api/auth/passkeys/authentication/verify',
]);

const PLATFORM_PATHS = [
  /^\/api\/admin\/organizations(?:\/|$)/,
  /^\/api\/admin\/plans(?:\/|$)/,
  /^\/api\/admin\/subscriptions(?:\/|$)/,
];

const TAGS: Array<[RegExp, string]> = [
  [/^\/api\/auth\/.*sso|^\/api\/auth\/(oidc|saml)/, 'SSO'],
  [/passkeys/, 'Passkeys'],
  [/^\/api\/auth/, 'Auth'],
  [/^\/api\/admin/, 'Platform Admin'],
  [/^\/api\/quota/, 'Quotas'],
  [/^\/api\/organizations/, 'Organizations'],
  [/^\/api\/companies/, 'Companies'],
  [/^\/api\/people/, 'People'],
  [/^\/api\/opportunities/, 'Opportunities'],
  [/^\/api\/tasks/, 'Tasks'],
  [/^\/api\/meetings/, 'Meetings'],
  [/^\/api\/notifications/, 'Notifications'],
  [/^\/api\/reports/, 'Reports'],
  [/^\/api\/activities/, 'Activities'],
  [/^\/api\/users/, 'Users'],
  [/^\/api\/products|^\/api\/product-catalog/, 'Products'],
  [/^\/api\/attachments/, 'Attachments'],
  [/^\/api\/health/, 'Health'],
];

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(OPENAPI_TITLE)
    .setDescription('Canonical frontend/backend contract for IAM CRM. Tenant organization is resolved from trusted authentication context.')
    .setVersion(OPENAPI_VERSION)
    .addServer('/', 'Relative API server; no Production hostname is embedded.')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Tenant or Platform JWT, interpreted by the route guards.' },
      'bearerAuth',
    )
    .addCookieAuth('refreshToken', { type: 'apiKey', in: 'cookie', description: 'HttpOnly refresh cookie used by auth/session flows.' }, 'refreshCookie')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => `${lowerFirst(controllerKey.replace(/Controller$/, ''))}${upperFirst(methodKey)}`,
    deepScanRoutes: true,
  });

  addCanonicalComponents(document);
  normalizeOperations(document);
  document.tags = [...new Set(TAGS.map(([, tag]) => tag))].map((name) => ({ name, description: `${name} API operations.` }));
  if (document.servers?.length === 0) delete document.servers;
  return sortDeep(document) as OpenAPIObject;
}

function normalizeOperations(document: OpenAPIObject) {
  const used = new Set<string>();
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = (pathItem as JsonObject)?.[method] as JsonObject | undefined;
      if (!operation) continue;
      const operationId = makeOperationId(method, path, used);
      used.add(operationId);
      operation.operationId = operationId;
      operation.tags = [tagFor(path)];
      operation.parameters = [
        ...(operation.parameters ?? []),
        {
          name: 'x-request-id',
          in: 'header',
          required: false,
          schema: { type: 'string' },
          description: 'Optional caller correlation ID; a generated value is used when omitted.',
        },
      ];
      for (const name of [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1])) {
        if (!operation.parameters.some((parameter: JsonObject) => parameter.in === 'path' && parameter.name === name)) {
          operation.parameters.unshift({ name, in: 'path', required: true, schema: { type: 'string' } });
        }
      }
      const key = `${method.toUpperCase()} ${path.replace(/\{([^}]+)\}/g, ':$1')}`;
      operation.security = securityFor(key);
      operation.description = contractDescription(path, operation.description);
      if (!['get', 'head', 'options'].includes(method) && (
        /^\/api\/auth\/(login|refresh|logout|logout-all|switch-tenant)$/.test(path) ||
        /^\/api\/auth\/(sessions|account|passkeys)(\/|$)/.test(path) || path === '/api/auth/sso/exchange'
      )) {
        operation.parameters.push({ name: 'Origin', in: 'header', required: true, schema: { type: 'string', format: 'uri' }, description: 'Must exactly match CORS_ORIGINS. Missing, null or untrusted origins return 403 AUTH_ORIGIN_REJECTED. Missing Origin is allowed only by explicit non-production AUTH_ALLOW_MISSING_ORIGIN=true.' });
      }
      normalizeResponses(operation, path, method);
      if ((path === '/api/attachments' || path === '/api/artifacts/upload') && method === 'post') addUploadBody(operation);
      if (PLATFORM_PATHS.some((pattern) => pattern.test(path))) {
        operation.description = `PlatformAdmin-only. Platform authority does not imply Tenant membership. ${operation.description ?? ''}`.trim();
      }
    }
  }
}

function normalizeResponses(operation: JsonObject, path: string, method: string) {
  if (/^\/api\/auth\/(oidc\/[^/]+\/(login|callback)|saml\/[^/]+\/(login|acs))$/.test(path)) {
    operation.responses = { '302': { description: 'Redirect to the identity provider or synthetic frontend callback URL.' }, '400': errorResponse('Invalid SSO request'), '500': errorResponse('Internal server error') };
    return;
  }
  if (/^\/api\/auth\/saml\/[^/]+\/metadata$/.test(path)) {
    operation.responses = { '200': { description: 'SAML service-provider metadata', content: { 'application/samlmetadata+xml': { schema: { type: 'string' } } } }, '400': errorResponse('Invalid tenant route') };
    return;
  }
  const successCode = operation.responses?.['201'] ? '201' : method === 'post' ? '201' : '200';
  const typed = TYPED_SUCCESS_PAYLOADS[`${method.toUpperCase()} ${path}`];
  const dataSchema = path === '/api/quota/current'
    ? { $ref: '#/components/schemas/QuotaSummary' }
    : typed
      ? typed.schema
    : { type: 'object', additionalProperties: true, description: 'Explicit public response payload; never a published Prisma model.' };
  operation.responses = {
    [successCode]: {
      description: 'Successful response',
      headers: { 'x-request-id': { $ref: '#/components/headers/RequestId' } },
      content: { 'application/json': { schema: typed?.paginated ? paginatedSuccessEnvelope(dataSchema) : successEnvelope(dataSchema) } },
    },
    '400': errorResponse('Bad request or validation failure'),
    '401': errorResponse('Authentication required or invalid'),
    '403': errorResponse('Permission, Tenant lifecycle, or feature entitlement denied'),
    '404': errorResponse('Resource not found'),
    '409': errorResponse('Conflict'),
    '429': errorResponse('Rate or quota limit exceeded; quota failures use code QUOTA_EXCEEDED'),
    '500': errorResponse('Internal server error'),
  };
}

function paginatedSuccessEnvelope(itemSchema: JsonObject): JsonObject {
  return {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      { type: 'object', required: ['data', 'meta'], properties: { data: { type: 'array', items: itemSchema }, meta: { $ref: '#/components/schemas/PaginationMeta' } } },
    ],
  };
}

function successEnvelope(dataSchema: JsonObject): JsonObject {
  return {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      { type: 'object', required: ['data'], properties: { data: dataSchema } },
    ],
  };
}

function errorResponse(description: string) {
  return {
    description,
    headers: { 'x-request-id': { $ref: '#/components/headers/RequestId' } },
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
  };
}

function addCanonicalComponents(document: OpenAPIObject) {
  const schemas = (document.components ??= {}).schemas ??= {};
  Object.assign(schemas, {
    ...RESPONSE_CONTRACT_SCHEMAS,
    SuccessEnvelope: {
      type: 'object', required: ['success', 'data', 'requestId', 'timestamp'],
      properties: {
        success: { type: 'boolean', enum: [true] }, data: {},
        requestId: { type: 'string', nullable: true }, timestamp: { type: 'string', format: 'date-time' },
        meta: { $ref: '#/components/schemas/PaginationMeta' },
      },
    },
    ErrorEnvelope: {
      type: 'object', required: ['success', 'error', 'requestId', 'timestamp', 'path', 'method', 'statusCode'],
      properties: {
        success: { type: 'boolean', enum: [false] },
        error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string', example: 'VALIDATION_ERROR' }, message: { type: 'string' }, details: {} } },
        requestId: { type: 'string', nullable: true }, timestamp: { type: 'string', format: 'date-time' },
        path: { type: 'string', example: '/api/companies' }, method: { type: 'string', example: 'GET' }, statusCode: { type: 'integer', format: 'int32' },
      },
    },
    PaginationQuery: { type: 'object', properties: { page: { type: 'integer', minimum: 1, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 } } },
    PaginationMeta: {
      type: 'object', required: ['total', 'page', 'limit', 'totalPages', 'hasNext', 'hasPrevious'],
      properties: { total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' }, totalPages: { type: 'integer' }, hasNext: { type: 'boolean' }, hasPrevious: { type: 'boolean' } },
    },
    SortOrder: { type: 'string', enum: ['asc', 'desc'] },
    SearchFilter: { type: 'object', properties: { search: { type: 'string', description: 'Domain-specific textual search when supported.' } } },
    UserRole: enumSchema(UserRole), OrganizationStatus: enumSchema(OrganizationStatus),
    FeatureKey: enumSchema(FeatureKey), SubscriptionStatus: enumSchema(SubscriptionStatus), QuotaMetric: enumSchema(QuotaMetric),
    QuotaResetPeriod: enumSchema(QuotaResetPeriod),
    QuotaConfigurationState: { type: 'string', enum: [...QUOTA_CONFIGURATION_STATES] },
    DecimalIntegerString: { type: 'string', pattern: '^-?[0-9]+$', example: '1000', description: 'Integer value serialized as a decimal string to preserve BigInt precision.' },
    QuotaSummaryMetric: {
      type: 'object', required: ['metric', 'state', 'current', 'softLimit', 'hardLimit', 'resetPeriod', 'resetAt', 'threshold'],
      properties: {
        metric: { $ref: '#/components/schemas/QuotaMetric' }, state: { $ref: '#/components/schemas/QuotaConfigurationState' },
        current: { $ref: '#/components/schemas/DecimalIntegerString' },
        softLimit: { type: 'string', pattern: '^[0-9]+$', nullable: true }, hardLimit: { type: 'string', pattern: '^[0-9]+$', nullable: true },
        resetPeriod: { $ref: '#/components/schemas/QuotaResetPeriod' }, resetAt: { type: 'string', format: 'date-time', nullable: true },
        threshold: { type: 'number', nullable: true, enum: [80, 90] },
      },
    },
    QuotaSummary: {
      type: 'object', required: ['organizationId', 'generatedAt', 'metrics'],
      properties: { organizationId: { type: 'string', format: 'uuid' }, generatedAt: { type: 'string', format: 'date-time' }, metrics: { type: 'array', items: { $ref: '#/components/schemas/QuotaSummaryMetric' } } },
    },
  });
  (document.components ??= {}).headers = {
    ...document.components?.headers,
    RequestId: { description: 'Correlation ID echoed in body and response header.', schema: { type: 'string' } },
  };
}

function addUploadBody(operation: JsonObject) {
  operation.requestBody = {
    required: true,
    content: { 'multipart/form-data': { schema: { type: 'object', required: ['file', 'entityType', 'entityId'], properties: { file: { type: 'string', format: 'binary' }, entityType: { type: 'string' }, entityId: { type: 'string', format: 'uuid' } } } } },
  };
}

function enumSchema(value: object) { return { type: 'string', enum: Object.values(value).filter((item) => typeof item === 'string') }; }
function tagFor(path: string) { return TAGS.find(([pattern]) => pattern.test(path))?.[1] ?? upperFirst(path.split('/').filter(Boolean)[1] ?? 'General'); }
function contractDescription(path: string, existing?: string) {
  const tenant = path.startsWith('/api/admin/') ? '' : ' Tenant-scoped operations derive Organization from trusted TenantContext; clients cannot override it.';
  return `${existing ?? ''}${tenant}`.trim();
}
function securityFor(key: string) {
  if (PUBLIC_OPERATIONS.has(key)) return [];
  if (key === 'POST /api/auth/refresh') return [{ refreshCookie: [] }];
  if (key === 'POST /api/auth/logout') return [{ refreshCookie: [] }, {}];
  if (key === 'POST /api/auth/switch-tenant') return [{ bearerAuth: [], refreshCookie: [] }];
  return [{ bearerAuth: [] }];
}
function makeOperationId(method: string, path: string, used: Set<string>) {
  const segments = path.replace(/^\/api\//, '').split('/').filter(Boolean).filter((part) => !part.startsWith('{'));
  let candidate = segments.map((part, index) => index === 0 ? camel(part) : upperFirst(camel(part))).join('') + upperFirst(method);
  if (used.has(candidate)) candidate += segments.length;
  return candidate;
}
function camel(value: string) { return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()).replace(/[^a-zA-Z0-9]/g, ''); }
function lowerFirst(value: string) { return value.charAt(0).toLowerCase() + value.slice(1); }
function upperFirst(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortDeep(child)]));
}
