import {
  CompanyActivityStatus,
  CompanyOwnership,
  LegacyPipelineStage,
  Priority,
  TaskStatus,
} from '@prisma/client';

type Schema = Record<string, any>;

const uuid = { type: 'string', format: 'uuid' };
const nullableUuid = { ...uuid, nullable: true };
const dateTime = { type: 'string', format: 'date-time' };
const nullableDateTime = { ...dateTime, nullable: true };
const nullableString = { type: 'string', nullable: true };
const enumOf = (values: object) => ({
  type: 'string',
  enum: Object.values(values).filter((value) => typeof value === 'string'),
});
const nullableRef = (name: string) => ({
  type: 'object',
  allOf: [{ $ref: `#/components/schemas/${name}` }],
  nullable: true,
});

const companyScalarProperties: Schema = {
  id: uuid,
  leadCode: uuid,
  legalName: { type: 'string' },
  brandName: nullableString,
  registrationNo: nullableString,
  registrationNumber: nullableString,
  nationalId: nullableString,
  economicCode: nullableString,
  establishmentDate: nullableDateTime,
  foundedYear: { type: 'integer', nullable: true },
  companyType: nullableString,
  ownership: { ...enumOf(CompanyOwnership), nullable: true },
  activityStatus: enumOf(CompanyActivityStatus),
  activityGroup: nullableString,
  marketSize: nullableString,
  industryId: nullableUuid,
  industry: nullableString,
  parentCompanyId: nullableUuid,
  website: nullableString,
  publicEmail: nullableString,
  headOfficeProvince: nullableString,
  headOfficeCity: nullableString,
  headOfficeAddress: nullableString,
  postalCode: nullableString,
  centralPhone: nullableString,
  registeredCapital: { type: 'string', nullable: true, description: 'Prisma Decimal serialized as a decimal string.' },
  employeeCount: { type: 'integer', nullable: true },
  annualRevenue: { type: 'string', nullable: true, pattern: '^[0-9]+$', description: 'BigInt serialized as a decimal string.' },
  ownerId: nullableUuid,
  priority: enumOf(Priority),
  stage: enumOf(LegacyPipelineStage),
  sourceId: nullableUuid,
  source: nullableString,
  nextActionDate: nullableDateTime,
  archivedAt: nullableDateTime,
  archivedById: nullableUuid,
  archiveReason: nullableString,
  researchCompletion: { type: 'object', nullable: true },
  createdAt: dateTime,
  updatedAt: dateTime,
  organizationId: uuid,
};

const companyRequired = [
  'id', 'leadCode', 'legalName', 'brandName', 'registrationNo', 'registrationNumber',
  'nationalId', 'economicCode', 'establishmentDate', 'foundedYear', 'companyType',
  'ownership', 'activityStatus', 'activityGroup', 'marketSize', 'industryId', 'industry',
  'parentCompanyId', 'website', 'publicEmail', 'headOfficeProvince', 'headOfficeCity',
  'headOfficeAddress', 'postalCode', 'centralPhone', 'registeredCapital', 'employeeCount',
  'annualRevenue', 'ownerId', 'priority', 'stage', 'sourceId', 'source', 'nextActionDate',
  'archivedAt', 'archivedById', 'archiveReason', 'researchCompletion', 'createdAt',
  'updatedAt', 'organizationId',
];

const taskScalarProperties: Schema = {
  id: uuid,
  title: { type: 'string' },
  description: nullableString,
  status: enumOf(TaskStatus),
  priority: enumOf(Priority),
  dueAt: nullableDateTime,
  reminderAt: nullableDateTime,
  companyId: nullableUuid,
  personId: nullableUuid,
  opportunityId: nullableUuid,
  commercialDocumentId: nullableUuid,
  paymentId: nullableUuid,
  assignedToId: nullableUuid,
  createdById: nullableUuid,
  completedAt: nullableDateTime,
  completedById: nullableUuid,
  completionNote: nullableString,
  cancelledAt: nullableDateTime,
  cancelReason: nullableString,
  createdAt: dateTime,
  updatedAt: dateTime,
  organizationId: uuid,
};

export const RESPONSE_CONTRACT_SCHEMAS: Record<string, Schema> = {
  UserSummary: {
    type: 'object', required: ['id', 'fullName'],
    properties: { id: uuid, fullName: { type: 'string' }, email: { type: 'string', format: 'email' }, role: { type: 'string' }, team: nullableString },
  },
  IndustrySummary: {
    type: 'object', required: ['id', 'name', 'description'],
    properties: { id: uuid, name: { type: 'string' }, description: nullableString },
  },
  LeadSourceSummary: {
    type: 'object', required: ['id', 'code', 'name', 'description', 'isActive'],
    properties: { id: uuid, code: { type: 'string' }, name: { type: 'string' }, description: nullableString, isActive: { type: 'boolean' } },
  },
  CompanyListItem: {
    type: 'object', required: [...companyRequired, 'owner', 'industryRef', 'sourceRef'],
    properties: { ...companyScalarProperties, owner: nullableRef('UserSummary'), industryRef: nullableRef('IndustrySummary'), sourceRef: nullableRef('LeadSourceSummary') },
  },
  CompanyResponse: {
    type: 'object', required: [...companyRequired, 'owner', 'industryRef', 'sourceRef', 'parentCompanies', 'subsidiaryCompanies'],
    properties: {
      ...companyScalarProperties,
      owner: nullableRef('UserSummary'), industryRef: nullableRef('IndustrySummary'), sourceRef: nullableRef('LeadSourceSummary'),
      parentCompanies: { type: 'array', items: { $ref: '#/components/schemas/CompanyScalar' } },
      subsidiaryCompanies: { type: 'array', items: { $ref: '#/components/schemas/CompanyScalar' } },
      people: { type: 'array', items: { $ref: '#/components/schemas/RelatedEntity' } },
      branches: { type: 'array', items: { $ref: '#/components/schemas/RelatedEntity' } },
      socialChannels: { type: 'array', items: { $ref: '#/components/schemas/RelatedEntity' } },
      activities: { type: 'array', items: { $ref: '#/components/schemas/RelatedEntity' } },
      opportunities: { type: 'array', items: { $ref: '#/components/schemas/RelatedEntity' } },
      legalDocuments: { type: 'array', items: { $ref: '#/components/schemas/RelatedEntity' } },
      stageHistory: { type: 'array', items: { $ref: '#/components/schemas/RelatedEntity' } },
      callCard: nullableRef('RelatedEntity'),
      parentRelations: { type: 'array', items: { $ref: '#/components/schemas/RelatedEntity' } },
      subsidiaryRelations: { type: 'array', items: { $ref: '#/components/schemas/RelatedEntity' } },
    },
  },
  CompanyScalar: { type: 'object', required: companyRequired, properties: companyScalarProperties },
  RelatedEntity: { type: 'object', required: ['id'], properties: { id: uuid } },
  TaskCompanySummary: { type: 'object', required: ['id', 'legalName', 'brandName', 'ownerId'], properties: { id: uuid, legalName: { type: 'string' }, brandName: nullableString, ownerId: nullableUuid } },
  TaskPersonSummary: { type: 'object', required: ['id', 'fullName', 'title', 'companyId'], properties: { id: uuid, fullName: { type: 'string' }, title: nullableString, companyId: uuid } },
  TaskOpportunitySummary: { type: 'object', required: ['id', 'title', 'companyId', 'ownerId', 'priority', 'archivedAt'], properties: { id: uuid, title: { type: 'string' }, companyId: uuid, ownerId: nullableUuid, priority: enumOf(Priority), archivedAt: nullableDateTime } },
  TaskCommercialDocumentSummary: { type: 'object', required: ['id', 'type', 'status', 'number', 'title', 'opportunityId'], properties: { id: uuid, type: { type: 'string' }, status: { type: 'string' }, number: nullableString, title: { type: 'string' }, opportunityId: uuid } },
  TaskPaymentSummary: { type: 'object', required: ['id', 'status', 'amount', 'currency', 'dueDate', 'opportunityId'], properties: { id: uuid, status: { type: 'string' }, amount: { type: 'string' }, currency: { type: 'string' }, dueDate: nullableDateTime, opportunityId: uuid } },
  TaskResponse: {
    type: 'object',
    required: [...Object.keys(taskScalarProperties), 'company', 'person', 'opportunity', 'commercialDocument', 'payment', 'assignedTo', 'createdBy', 'completedBy'],
    properties: { ...taskScalarProperties, company: nullableRef('TaskCompanySummary'), person: nullableRef('TaskPersonSummary'), opportunity: nullableRef('TaskOpportunitySummary'), commercialDocument: nullableRef('TaskCommercialDocumentSummary'), payment: nullableRef('TaskPaymentSummary'), assignedTo: nullableRef('UserSummary'), createdBy: nullableRef('UserSummary'), completedBy: nullableRef('UserSummary') },
  },
  DeletedTaskResponse: { type: 'object', required: Object.keys(taskScalarProperties), properties: taskScalarProperties },
};

export const TYPED_SUCCESS_PAYLOADS: Record<string, { schema: Schema; paginated?: boolean }> = {
  'GET /api/companies': { schema: { $ref: '#/components/schemas/CompanyListItem' }, paginated: true },
  'POST /api/companies': { schema: { $ref: '#/components/schemas/CompanyResponse' } },
  'GET /api/companies/{id}': { schema: { $ref: '#/components/schemas/CompanyResponse' } },
  'PATCH /api/companies/{id}': { schema: { $ref: '#/components/schemas/CompanyResponse' } },
  'GET /api/tasks': { schema: { $ref: '#/components/schemas/TaskResponse' }, paginated: true },
  'POST /api/tasks': { schema: { $ref: '#/components/schemas/TaskResponse' } },
  'GET /api/tasks/{id}': { schema: { $ref: '#/components/schemas/TaskResponse' } },
  'PATCH /api/tasks/{id}': { schema: { $ref: '#/components/schemas/TaskResponse' } },
  'DELETE /api/tasks/{id}': { schema: { $ref: '#/components/schemas/DeletedTaskResponse' } },
};
