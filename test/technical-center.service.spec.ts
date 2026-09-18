import { ForbiddenException } from '@nestjs/common';
import {
  KnowledgeBaseStatus,
  KnowledgeContentType,
  TechnicalDocumentStatus,
  TechnicalConfidentiality,
  TechnicalReleaseStatus,
  TechnicalResourceStatus,
  TenderStatus,
  TenderRequirementStatus,
  TenderReviewStatus,
  TenderReviewType,
  TenderBidDecision,
  TenderQualificationDecision,
} from '@prisma/client';
import { CurrentUserPayload } from '../src/common/decorators/current-user.decorator';
import { TechnicalCenterService } from '../src/technical-center/technical-center.service';

const organizationId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const user = (permissions: string[] = []): CurrentUserPayload => ({
  userId: '33333333-3333-4333-8333-333333333333', email: 'admin@example.com', role: 'ADMIN',
  membershipId: '44444444-4444-4444-8444-444444444444', organizationId,
  tenantContext: {
    tenantId: organizationId, organizationId, userId: '33333333-3333-4333-8333-333333333333',
    membershipId: '44444444-4444-4444-8444-444444444444', tenantRole: 'ADMIN', permissions,
    platformAdmin: false, membershipStatus: 'active', resolutionSource: 'authenticated-membership',
  },
});

describe('TechnicalCenterService', () => {
  const release = {
    id: '55555555-5555-4555-8555-555555555555', organizationId, productId, version: '1.0.0', title: 'Release',
    summary: null, releaseNotes: null, status: TechnicalReleaseStatus.DRAFT, releaseDate: null,
    supportStartDate: null, supportEndDate: null, endOfLifeDate: null, createdById: user().userId,
    updatedById: user().userId, revision: 1, archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
  let prisma: any;
  let audit: any;
  let tasks: any;
  let service: TechnicalCenterService;

  beforeEach(() => {
    prisma = {
      productCatalogItem: { findUnique: jest.fn().mockResolvedValue({ id: productId }) },
      technicalRelease: {
        create: jest.fn().mockResolvedValue(release), findFirst: jest.fn().mockResolvedValue(release),
        findMany: jest.fn().mockResolvedValue([release]), count: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      knowledgeBaseArticle: {
        create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0), update: jest.fn(),
      },
      technicalDocument: {
        create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      technicalDocumentVersion: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      technicalResource: {
        create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0), update: jest.fn(),
      },
      fileAttachment: { groupBy: jest.fn().mockResolvedValue([]) },
      tender: {
        create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      tenderRequirement: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), delete: jest.fn() },
      tenderRequirementDependency: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
      tenderDeliverable: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
      tenderReview: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn() },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      organizationMembership: { findFirst: jest.fn().mockResolvedValue({ id: 'membership' }) },
      company: { findFirst: jest.fn().mockResolvedValue({ id: 'company' }) },
      opportunity: { findFirst: jest.fn().mockResolvedValue({ id: 'opportunity' }) },
      team: { findFirst: jest.fn().mockResolvedValue({ id: 'team' }) },
    };
    prisma.$transaction = jest.fn((callback: (tx: any) => unknown) => callback(prisma));
    audit = { recordTenantEvent: jest.fn().mockResolvedValue({ id: 'audit' }) };
    tasks = { findOne: jest.fn(), create: jest.fn() };
    service = new TechnicalCenterService(prisma, audit, undefined, tasks);
  });

  it('derives tenant ownership from the authenticated context and audits creation', async () => {
    prisma.technicalRelease.findFirst.mockResolvedValueOnce(null);
    await service.createRelease({ productId, version: '1.0.0', title: 'Release' }, user());
    expect(prisma.technicalRelease.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId, productId, createdById: user().userId }),
    }));
    expect(audit.recordTenantEvent).toHaveBeenCalledWith(expect.objectContaining({ organizationId, action: 'technical-release.created' }));
  });

  it('returns a structured conflict for a duplicate tenant product version', async () => {
    prisma.technicalRelease.findFirst.mockResolvedValueOnce({ id: 'duplicate' });
    await expect(service.createRelease({ productId, version: '1.0.0', title: 'Release' }, user()))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'DUPLICATE_RELEASE_VERSION' }) });
  });

  it('always applies organizationId to list filters', async () => {
    await service.listReleases({ page: 1, limit: 20 }, user());
    expect(prisma.technicalRelease.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId }) }));
  });

  it('applies partial version and broad search to the release list on the server', async () => {
    await service.listReleases(
      { page: 1, limit: 20, version: '2.4', search: 'gateway' },
      user(),
    );
    expect(prisma.technicalRelease.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId,
          version: { contains: '2.4', mode: 'insensitive' },
          OR: expect.arrayContaining([
            { summary: { contains: 'gateway', mode: 'insensitive' } },
            { product: { name: { contains: 'gateway', mode: 'insensitive' } } },
          ]),
        }),
      }),
    );
  });

  it('requires the privileged publish permission for release publication', async () => {
    prisma.technicalRelease.findFirst.mockResolvedValue({ ...release, status: TechnicalReleaseStatus.PLANNED });
    await expect(service.transitionRelease(release.id, { status: 'RELEASED' }, user(['technical-release:manage']))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.technicalRelease.updateMany).not.toHaveBeenCalled();
  });

  it('uses revision in lifecycle updates and records the transition', async () => {
    prisma.technicalRelease.findFirst
      .mockResolvedValueOnce({
        ...release,
        status: TechnicalReleaseStatus.PLANNED,
        releaseDate: new Date('2026-08-01'),
      })
      .mockResolvedValueOnce({ ...release, status: TechnicalReleaseStatus.RELEASED, revision: 2 });
    await service.transitionRelease(release.id, { status: 'RELEASED', revision: 1 }, user(['technical-release:publish']));
    expect(prisma.technicalRelease.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: release.id, organizationId, revision: 1 } }));
    expect(audit.recordTenantEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'technical-release.released' }));
  });

  it('creates a tenant-scoped knowledge draft and publishes only through lifecycle policy', async () => {
    const article = { id: 'kb', organizationId, title: 'KB', slug: 'kb', content: 'body', status: KnowledgeBaseStatus.DRAFT, archivedAt: null };
    prisma.knowledgeBaseArticle.create.mockResolvedValue(article);
    await service.createKnowledge({ title: 'KB', slug: 'KB', content: 'body' }, user());
    expect(prisma.knowledgeBaseArticle.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId, slug: 'kb' }) }));

    prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(article);
    await expect(service.transitionKnowledge('kb', { status: 'PUBLISHED' }, user(['technical-knowledge:publish'])))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_LIFECYCLE_TRANSITION' }) });

    prisma.knowledgeBaseArticle.findFirst.mockResolvedValue({ ...article, status: KnowledgeBaseStatus.IN_REVIEW });
    prisma.knowledgeBaseArticle.update.mockResolvedValue({ ...article, status: KnowledgeBaseStatus.PUBLISHED });
    await service.transitionKnowledge('kb', { status: 'PUBLISHED' }, user(['technical-knowledge:publish']));
    expect(audit.recordTenantEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'technical-knowledge.published' }));
  });

  it('applies tenant isolation to knowledge lookup', async () => {
    prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(null);
    await expect(service.getKnowledge('foreign', user())).rejects.toThrow('Knowledge article not found');
    expect(prisma.knowledgeBaseArticle.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'foreign', organizationId },
      include: expect.objectContaining({ product: expect.any(Object), author: expect.any(Object) }),
    }));
  });

  it('applies knowledge visibility, category and not-due filters on the server', async () => {
    await service.listKnowledge({
      page: 1,
      limit: 20,
      category: 'راهنما',
      visibility: 'RESTRICTED',
      reviewDue: 'false',
    }, user());
    expect(prisma.knowledgeBaseArticle.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId,
        visibility: 'RESTRICTED',
        category: { contains: 'راهنما', mode: 'insensitive' },
        AND: expect.any(Array),
      }),
      include: expect.objectContaining({ reviewer: expect.any(Object), release: expect.any(Object) }),
    }));
  });

  it('returns tenant-scoped distinct knowledge category options', async () => {
    prisma.knowledgeBaseArticle.findMany.mockResolvedValue([
      { category: 'راهنما' },
      { category: 'عملیات' },
    ]);
    await expect(service.listKnowledgeCategories('را', user())).resolves.toEqual([
      { id: 'راهنما', label: 'راهنما' },
      { id: 'عملیات', label: 'عملیات' },
    ]);
    expect(prisma.knowledgeBaseArticle.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId, archivedAt: null }),
      distinct: ['category'],
    }));
  });

  it('rejects duplicate article slugs with a stable error code', async () => {
    prisma.knowledgeBaseArticle.findFirst.mockResolvedValue({ id: 'duplicate' });
    await expect(service.createKnowledge({
      title: 'راهنما',
      slug: 'Guide',
      content: 'محتوا',
    }, user())).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DUPLICATE_KNOWLEDGE_SLUG' }),
    });
    expect(prisma.knowledgeBaseArticle.create).not.toHaveBeenCalled();
  });

  it('requires review mode before editing a published article', async () => {
    prisma.knowledgeBaseArticle.findFirst.mockResolvedValue({
      id: 'kb',
      organizationId,
      status: KnowledgeBaseStatus.PUBLISHED,
      archivedAt: null,
    });
    await expect(service.updateKnowledge('kb', { title: 'عنوان جدید' }, user()))
      .rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PUBLISHED_KNOWLEDGE_LOCKED' }),
      });
    expect(prisma.knowledgeBaseArticle.update).not.toHaveBeenCalled();
  });

  it('allows optional knowledge metadata and relations to be cleared explicitly', async () => {
    prisma.knowledgeBaseArticle.findFirst.mockResolvedValue({
      id: 'kb',
      organizationId,
      status: KnowledgeBaseStatus.DRAFT,
      archivedAt: null,
      productId,
      releaseId: release.id,
      contentType: KnowledgeContentType.ARTICLE,
      content: 'متن مقاله',
      externalUrl: null,
    });
    prisma.knowledgeBaseArticle.update.mockResolvedValue({ id: 'kb' });
    await service.updateKnowledge('kb', {
      summary: null,
      category: null,
      productId: null,
      releaseId: null,
      ownerId: null,
      reviewerId: null,
      nextReviewAt: null,
    }, user());
    expect(prisma.knowledgeBaseArticle.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        summary: null,
        category: null,
        productId: null,
        releaseId: null,
        ownerId: null,
        reviewerId: null,
        nextReviewAt: null,
      }),
    }));
  });

  it('stores an external knowledge source without duplicating article content', async () => {
    prisma.knowledgeBaseArticle.findFirst.mockResolvedValueOnce(null);
    prisma.knowledgeBaseArticle.create.mockResolvedValue({ id: 'kb-link' });
    await service.createKnowledge({
      title: 'راهنما',
      slug: 'guide',
      contentType: KnowledgeContentType.EXTERNAL_LINK,
      externalUrl: 'https://docs.google.com/document/d/example',
    }, user());
    expect(prisma.knowledgeBaseArticle.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        contentType: KnowledgeContentType.EXTERNAL_LINK,
        externalUrl: 'https://docs.google.com/document/d/example',
        content: null,
      }),
    }));
  });

  it('rejects external knowledge without a source URL', async () => {
    await expect(service.createKnowledge({
      title: 'راهنما',
      slug: 'guide',
      contentType: KnowledgeContentType.EXTERNAL_LINK,
    }, user())).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'KNOWLEDGE_EXTERNAL_URL_REQUIRED' }),
    });
  });

  it('requires a reason to archive a knowledge article', async () => {
    prisma.knowledgeBaseArticle.findFirst.mockResolvedValue({
      id: 'kb',
      organizationId,
      status: KnowledgeBaseStatus.DRAFT,
      archivedAt: null,
    });
    await expect(service.transitionKnowledge(
      'kb',
      { status: 'ARCHIVED' },
      user(['technical-knowledge:manage']),
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'KNOWLEDGE_ARCHIVE_REASON_REQUIRED' }),
    });
    expect(prisma.knowledgeBaseArticle.update).not.toHaveBeenCalled();
  });

  it('validates document owner membership and enforces approval lifecycle', async () => {
    const document = { id: 'doc', organizationId, title: 'Doc', documentType: 'ARCHITECTURE', ownerId: user().userId, status: TechnicalDocumentStatus.DRAFT, revision: 1, archivedAt: null, effectiveFrom: null, versions: [] };
    prisma.technicalDocument.create.mockResolvedValue(document);
    await service.createDocument({ title: 'Doc', documentType: 'ARCHITECTURE', ownerId: user().userId }, user());
    expect(prisma.organizationMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId, userId: user().userId }) }));

    prisma.technicalDocument.findFirst.mockResolvedValue({ ...document, status: TechnicalDocumentStatus.IN_REVIEW });
    await expect(service.transitionDocument('doc', { status: 'APPROVED' }, user(['technical-document:manage']))).rejects.toBeInstanceOf(ForbiddenException);
    prisma.technicalDocument.findFirst
      .mockResolvedValueOnce({ ...document, status: TechnicalDocumentStatus.IN_REVIEW })
      .mockResolvedValueOnce({ ...document, status: TechnicalDocumentStatus.APPROVED, revision: 2 });
    prisma.technicalDocumentVersion.findFirst.mockResolvedValue({
      id: 'version', approvedAt: null, attachment: { id: 'attachment', deletedAt: null },
    });
    await service.transitionDocument('doc', { status: 'APPROVED' }, user(['technical-document:approve']));
    expect(audit.recordTenantEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'technical-document.approved' }));
  });

  it('rejects cross-tenant document relations', async () => {
    prisma.company.findFirst.mockResolvedValueOnce(null);
    await expect(service.createDocument({ title: 'Doc', documentType: 'SECURITY', ownerId: user().userId, companyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, user())).rejects.toThrow('company not found');
    expect(prisma.technicalDocument.create).not.toHaveBeenCalled();
  });

  it('filters documents by confidentiality and tender inside the tenant', async () => {
    const tenderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await service.listDocuments({
      page: 1,
      limit: 20,
      confidentiality: TechnicalConfidentiality.CONFIDENTIAL,
      tenderId,
    }, user());
    expect(prisma.technicalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId,
          confidentiality: 'CONFIDENTIAL',
          tenderId,
        }),
      }),
    );
    expect(prisma.technicalDocument.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId,
        confidentiality: 'CONFIDENTIAL',
        tenderId,
      }),
    });
  });

  it('creates and filters resources inside the tenant and validates release linkage', async () => {
    const resource = { id: 'resource', organizationId, title: 'SDK', resourceType: 'SDK', status: TechnicalResourceStatus.DRAFT, archivedAt: null };
    prisma.technicalResource.create.mockResolvedValue(resource);
    await service.createResource({ title: 'SDK', resourceType: 'SDK', productId }, user());
    expect(prisma.technicalResource.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId, productId }) }));
    await service.listResources({ page: 1, limit: 20, type: 'SDK', status: 'DRAFT' }, user());
    expect(prisma.technicalResource.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId, resourceType: 'SDK', status: 'DRAFT' }) }));
  });

  it('creates a tender, protects submit permission, and rejects invalid lifecycle jumps', async () => {
    const tender = { id: 'tender', organizationId, title: 'RFP', tenderType: 'RFP', ownerId: user().userId, status: TenderStatus.DRAFT, revision: 1, archivedAt: null, requirements: [], deliverables: [] };
    prisma.tender.create.mockResolvedValue(tender);
    await service.createTender({ title: 'RFP', tenderType: 'RFP', ownerId: user().userId }, user());
    expect(prisma.tender.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId, ownerId: user().userId }) }));

    prisma.tender.findFirst.mockResolvedValue(tender);
    await expect(service.transitionTender('tender', { status: 'SUBMITTED' }, user(['technical-tender:submit'])))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_LIFECYCLE_TRANSITION' }) });
    prisma.tender.findFirst.mockResolvedValue({ ...tender, status: TenderStatus.READY_FOR_SUBMISSION });
    await expect(service.transitionTender('tender', { status: 'SUBMITTED' }, user(['technical-tender:manage']))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('submits a ready tender with actor and timestamp through optimistic concurrency', async () => {
    const ready = {
      id: 'tender', organizationId, title: 'RFP', tenderType: 'RFP', ownerId: user().userId,
      companyId: 'company', submissionDeadline: new Date(Date.now() + 86400000), status: TenderStatus.READY_FOR_SUBMISSION,
      bidDecision: TenderBidDecision.BID, qualificationDecision: TenderQualificationDecision.GO,
      revision: 3, archivedAt: null, requirements: [], deliverables: [], reviews: [
        { id: 'technical', type: TenderReviewType.TECHNICAL, status: TenderReviewStatus.APPROVED },
        { id: 'commercial', type: TenderReviewType.COMMERCIAL, status: TenderReviewStatus.APPROVED },
      ],
    };
    prisma.tender.findFirst
      .mockResolvedValueOnce(ready)
      .mockResolvedValueOnce({ ...ready, status: TenderStatus.SUBMITTED, revision: 4, submittedById: user().userId, submittedAt: new Date() });
    await expect(service.transitionTender('tender', { status: TenderStatus.SUBMITTED, revision: 3 }, user(['technical-tender:submit'])))
      .resolves.toMatchObject({ status: TenderStatus.SUBMITTED, submittedById: user().userId });
    expect(prisma.tender.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tender', organizationId, revision: 3 },
      data: expect.objectContaining({ status: TenderStatus.SUBMITTED, submittedById: user().userId, submittedAt: expect.any(Date) }),
    }));
    expect(audit.recordTenantEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'technical-tender.submitted' }));
  });

  it('applies tender list filters and tenant ownership', async () => {
    await service.listTenders({ page: 1, limit: 20, companyId: 'company', status: 'DRAFT', type: 'RFP' }, user());
    expect(prisma.tender.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId, companyId: 'company', status: 'DRAFT', tenderType: 'RFP' }) }));
  });

  it('supports tenant-scoped requirement create, update, list and delete', async () => {
    const tender = { id: 'tender', organizationId, status: TenderStatus.PREPARING, requirements: [], deliverables: [] };
    const requirement = { id: 'requirement', organizationId, tenderId: 'tender', title: 'Compliance', status: 'OPEN' };
    prisma.tender.findFirst.mockResolvedValue(tender);
    prisma.tenderRequirement.create.mockResolvedValue(requirement);
    prisma.tenderRequirement.findMany.mockResolvedValue([requirement]);
    prisma.tenderRequirement.findFirst.mockResolvedValue(requirement);
    prisma.tenderRequirement.update.mockResolvedValue({ ...requirement, status: 'READY' });
    await service.addRequirement('tender', { title: 'Compliance' }, user());
    await expect(service.listRequirements('tender', user())).resolves.toEqual([requirement]);
    await service.updateRequirement('tender', 'requirement', { status: 'READY' }, user());
    await service.removeRequirement('tender', 'requirement', user());
    expect(prisma.tenderRequirement.delete).toHaveBeenCalledWith({ where: { id: 'requirement' } });
    expect(audit.recordTenantEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'technical-tender.requirement-status-changed' }));
  });

  it('computes deterministic readiness and blocks READY_FOR_SUBMISSION while mandatory work is unresolved', async () => {
    const tender = {
      id: 'tender', organizationId, title: 'RFP', tenderType: 'RFP', ownerId: user().userId,
      companyId: 'company', submissionDeadline: new Date(Date.now() + 86400000), status: TenderStatus.COMMERCIAL_REVIEW,
      revision: 1, archivedAt: null,
      requirements: [{ id: 'req', mandatory: true, status: TenderRequirementStatus.OPEN, ownerId: user().userId }],
      deliverables: [], reviews: [],
    };
    prisma.tender.findFirst.mockResolvedValue(tender);
    const readiness = await service.getTenderReadiness('tender', user());
    expect(readiness.overallReady).toBe(false);
    expect(readiness.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'MANDATORY_REQUIREMENTS_INCOMPLETE', count: 1 })]));
    await expect(service.transitionTender('tender', { status: TenderStatus.READY_FOR_SUBMISSION, revision: 1 }, user(['technical-tender:manage'])))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'TENDER_NOT_READY' }) });
  });

  it('requires a reason when blocking a requirement', async () => {
    const tender = { id: 'tender', organizationId, status: TenderStatus.PREPARING, revision: 1, archivedAt: null, requirements: [], deliverables: [], reviews: [] };
    prisma.tender.findFirst.mockResolvedValue(tender);
    prisma.tenderRequirement.findFirst.mockResolvedValue({ id: 'req', tenderId: 'tender', organizationId, status: TenderRequirementStatus.OPEN });
    await expect(service.updateRequirement('tender', 'req', { status: TenderRequirementStatus.BLOCKED }, user()))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'REQUIREMENT_BLOCK_REASON_REQUIRED' }) });
  });

  it('returns resource relations and artifact counts from the list API', async () => {
    const resource = { id: 'resource', organizationId, title: 'SDK', resourceType: 'SDK', status: TechnicalResourceStatus.DRAFT, archivedAt: null };
    prisma.technicalResource.findMany.mockResolvedValueOnce([resource]);
    prisma.fileAttachment.groupBy.mockResolvedValueOnce([{ entityId: 'resource', _count: { _all: 2 } }]);
    const result = await service.listResources({ page: 1, limit: 20 }, user());
    expect(prisma.technicalResource.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ product: expect.anything(), release: expect.anything(), owner: expect.anything() }) }));
    expect(result.data[0]).toMatchObject({ id: 'resource', artifactCount: 2 });
  });

  it('requires URL for an external technical resource', async () => {
    await expect(service.createResource({ title: 'مرجع', resourceType: 'EXTERNAL_LINK' }, user()))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'TECHNICAL_RESOURCE_URL_REQUIRED' }) });
  });

  it('rejects an invalid technical release support schedule', async () => {
    prisma.technicalRelease.findFirst.mockResolvedValueOnce(null);
    await expect(service.createRelease({
      productId,
      version: '2.0.0',
      title: 'Release',
      releaseDate: '2026-09-10',
      supportEndDate: '2026-09-01',
    }, user())).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RELEASE_DATE_ORDER_INVALID' }),
    });
    expect(prisma.technicalRelease.create).not.toHaveBeenCalled();
  });

  it('requires a release date before moving a draft release to planned', async () => {
    prisma.technicalRelease.findFirst.mockResolvedValue(release);
    await expect(service.transitionRelease(release.id, { status: 'PLANNED' }, user(['technical-release:manage'])))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'RELEASE_DATE_REQUIRED' }) });
    expect(prisma.technicalRelease.updateMany).not.toHaveBeenCalled();
  });

  it('locks product and version identity after publication', async () => {
    prisma.technicalRelease.findFirst.mockResolvedValue({ ...release, status: TechnicalReleaseStatus.RELEASED });
    await expect(service.updateRelease(release.id, { version: '2.0.0' }, user(['technical-release:manage'])))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'RELEASE_IDENTITY_LOCKED' }) });
    expect(prisma.technicalRelease.updateMany).not.toHaveBeenCalled();
  });

  it('requires a reason for consequential release lifecycle changes', async () => {
    prisma.technicalRelease.findFirst.mockResolvedValue({
      ...release,
      status: TechnicalReleaseStatus.RELEASED,
      releaseDate: new Date('2026-08-01'),
    });
    await expect(service.transitionRelease(
      release.id,
      { status: 'DEPRECATED' },
      user(['technical-release:publish']),
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RELEASE_TRANSITION_REASON_REQUIRED' }),
    });
    expect(prisma.technicalRelease.updateMany).not.toHaveBeenCalled();
  });

  it('returns a stable conflict when a technical document is already linked to a tender', async () => {
    const tender = { id: 'tender', organizationId, title: 'RFP', tenderType: 'RFP', ownerId: user().userId, status: TenderStatus.DRAFT, revision: 1, archivedAt: null, requirements: [], deliverables: [] };
    prisma.tender.findFirst.mockResolvedValue(tender);
    prisma.technicalDocument.findFirst.mockResolvedValue({ id: 'doc', organizationId, archivedAt: null });
    prisma.tenderDeliverable.findFirst.mockResolvedValue({ id: 'existing-deliverable' });

    await expect(service.addDeliverable('tender', { documentId: 'doc' }, user(['technical-tender:manage'])))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'DUPLICATE_TENDER_DELIVERABLE' }) });
    expect(prisma.tenderDeliverable.create).not.toHaveBeenCalled();
  });

  it('does not send a technical document to review without a current version file', async () => {
    const document = { id: 'doc', organizationId, title: 'Doc', documentType: 'ARCHITECTURE', ownerId: user().userId, status: TechnicalDocumentStatus.DRAFT, revision: 1, archivedAt: null, effectiveFrom: null, versions: [] };
    prisma.technicalDocument.findFirst.mockResolvedValue(document);
    prisma.technicalDocumentVersion.findFirst.mockResolvedValue(null);

    await expect(service.transitionDocument('doc', { status: 'IN_REVIEW' }, user(['technical-document:manage'])))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'DOCUMENT_VERSION_FILE_REQUIRED' }) });
    expect(prisma.technicalDocument.updateMany).not.toHaveBeenCalled();
  });

  it('rejects duplicate technical document version numbers with a stable error code', async () => {
    const document = { id: 'doc', organizationId, title: 'Doc', documentType: 'ARCHITECTURE', ownerId: user().userId, status: TechnicalDocumentStatus.DRAFT, revision: 1, archivedAt: null, versions: [] };
    prisma.technicalDocument.findFirst.mockResolvedValue(document);
    prisma.technicalDocumentVersion.findFirst.mockResolvedValue({ id: 'existing-version' });

    await expect(service.addDocumentVersion('doc', { version: '1.0' }, user(['technical-document:manage'])))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'DUPLICATE_DOCUMENT_VERSION' }) });
    expect(prisma.technicalDocumentVersion.create).not.toHaveBeenCalled();
  });

  it('updates qualification and audits consequential decisions', async () => {
    const tender = { id: 'tender', organizationId, status: TenderStatus.QUALIFICATION, revision: 1, archivedAt: null, bidDecision: TenderBidDecision.UNDECIDED, qualificationDecision: TenderQualificationDecision.PENDING, qualificationConditions: null, decisionReason: null, requirements: [], deliverables: [], reviews: [] };
    prisma.tender.findFirst.mockResolvedValueOnce(tender).mockResolvedValueOnce({ ...tender, revision: 2, bidDecision: TenderBidDecision.BID, qualificationDecision: TenderQualificationDecision.GO, fitScore: 85 });
    await service.updateTenderQualification('tender', { bidDecision: TenderBidDecision.BID, qualificationDecision: TenderQualificationDecision.GO, fitScore: 85, revision: 1 }, user());
    expect(prisma.tender.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'tender', organizationId, revision: 1 }, data: expect.objectContaining({ fitScore: 85 }) }));
    expect(audit.recordTenantEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'technical-tender.qualification-updated' }));
  });

  it('requires conditions for CONDITIONAL_GO and a reason for NO_GO or NO_BID', async () => {
    const tender = { id: 'tender', organizationId, status: TenderStatus.QUALIFICATION, revision: 1, archivedAt: null, bidDecision: TenderBidDecision.UNDECIDED, qualificationDecision: TenderQualificationDecision.PENDING, qualificationConditions: null, decisionReason: null, requirements: [], deliverables: [], reviews: [] };
    prisma.tender.findFirst.mockResolvedValue(tender);
    await expect(service.updateTenderQualification('tender', { qualificationDecision: TenderQualificationDecision.CONDITIONAL_GO }, user())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'QUALIFICATION_CONDITIONS_REQUIRED' }) });
    await expect(service.updateTenderQualification('tender', { bidDecision: TenderBidDecision.NO_BID }, user())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'QUALIFICATION_DECISION_REASON_REQUIRED' }) });
  });

  it('does not enter preparation before participation and qualification are approved', async () => {
    const tender = { id: 'tender', organizationId, status: TenderStatus.QUALIFICATION, revision: 1, archivedAt: null, bidDecision: TenderBidDecision.UNDECIDED, qualificationDecision: TenderQualificationDecision.PENDING, requirements: [], deliverables: [], reviews: [] };
    prisma.tender.findFirst.mockResolvedValue(tender);
    await expect(service.transitionTender('tender', { status: TenderStatus.PREPARING, revision: 1 }, user(['technical-tender:manage'])))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'TENDER_BID_DECISION_REQUIRED' }) });
    prisma.tender.findFirst.mockResolvedValue({ ...tender, bidDecision: TenderBidDecision.BID });
    await expect(service.transitionTender('tender', { status: TenderStatus.PREPARING, revision: 1 }, user(['technical-tender:manage'])))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'TENDER_QUALIFICATION_APPROVAL_REQUIRED' }) });
  });

  it('rejects cross-tender parents and hierarchy cycles', async () => {
    const tender = { id: 'tender', organizationId, status: TenderStatus.PREPARING, requirements: [], deliverables: [], reviews: [] };
    prisma.tender.findFirst.mockResolvedValue(tender);
    prisma.tenderRequirement.findFirst.mockResolvedValue({ id: 'req', tenderId: 'tender', organizationId, status: TenderRequirementStatus.OPEN });
    prisma.tenderRequirement.count.mockResolvedValueOnce(0);
    await expect(service.updateRequirement('tender', 'req', { parentRequirementId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, user())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'REQUIREMENT_TENDER_MISMATCH' }) });
    prisma.tenderRequirement.count.mockResolvedValueOnce(1);
    prisma.tenderRequirement.findMany.mockResolvedValue([{ id: 'req', parentRequirementId: null }, { id: 'child', parentRequirementId: 'req' }]);
    await expect(service.updateRequirement('tender', 'req', { parentRequirementId: 'child' }, user())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'REQUIREMENT_PARENT_CYCLE' }) });
  });

  it('rejects self and cyclic dependencies and duplicate dependency rows', async () => {
    const tender = { id: 'tender', organizationId, status: TenderStatus.PREPARING, requirements: [], deliverables: [], reviews: [] };
    prisma.tender.findFirst.mockResolvedValue(tender);
    prisma.tenderRequirement.findFirst.mockResolvedValue({ id: 'req', tenderId: 'tender', organizationId });
    prisma.tenderRequirement.count.mockResolvedValue(1);
    await expect(service.addRequirementDependency('tender', 'req', { dependsOnRequirementId: 'req' }, user())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'REQUIREMENT_SELF_DEPENDENCY' }) });
    prisma.tenderRequirementDependency.findMany.mockResolvedValue([{ requirementId: 'dependency', dependsOnRequirementId: 'req' }]);
    await expect(service.addRequirementDependency('tender', 'req', { dependsOnRequirementId: 'dependency' }, user())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'REQUIREMENT_DEPENDENCY_CYCLE' }) });
  });

  it('links, creates and unlinks normal tasks without deleting them', async () => {
    const tender = { id: 'tender', organizationId, title: 'RFP', companyId: null, opportunityId: null, status: TenderStatus.PREPARING, requirements: [], deliverables: [], reviews: [] };
    const requirement = { id: 'req', tenderId: 'tender', organizationId, title: 'Security', referenceId: 'SEC-1', description: null, taskId: null };
    prisma.tender.findFirst.mockResolvedValue(tender);
    prisma.tenderRequirement.findFirst.mockResolvedValue(requirement);
    prisma.tenderRequirement.update.mockImplementation(({ data }: any) => Promise.resolve({ ...requirement, ...data }));
    tasks.findOne.mockResolvedValue({ id: 'task', organizationId });
    await service.linkRequirementTask('tender', 'req', { taskId: 'task' }, user(['task:view']));
    tasks.create.mockResolvedValue({ id: 'created-task', organizationId, title: 'پیگیری الزام: Security' });
    await service.createRequirementTask('tender', 'req', {}, user(['task:create']));
    prisma.tenderRequirement.findFirst.mockResolvedValue({ ...requirement, taskId: 'created-task' });
    await service.unlinkRequirementTask('tender', 'req', user());
    expect(tasks.create).toHaveBeenCalled();
    expect(prisma.tenderRequirement.update).toHaveBeenCalledWith({ where: { id: 'req' }, data: { taskId: null } });
    expect(prisma.tenderRequirement.delete).not.toHaveBeenCalled();
  });

  it('keeps technical and commercial reviews separate and enforces review permission', async () => {
    const tender = { id: 'tender', organizationId, title: 'RFP', ownerId: user().userId, status: TenderStatus.TECHNICAL_REVIEW, revision: 1, archivedAt: null, requirements: [], deliverables: [], reviews: [] };
    prisma.tender.findFirst.mockResolvedValue(tender);
    prisma.tenderReview.create.mockResolvedValue({ id: 'review', tenderId: 'tender', type: TenderReviewType.TECHNICAL, status: TenderReviewStatus.PENDING });
    await expect(service.requestTenderReview('tender', { type: TenderReviewType.TECHNICAL }, user(['technical-tender:manage'])))
      .rejects.toBeInstanceOf(ForbiddenException);
    await service.requestTenderReview('tender', { type: TenderReviewType.TECHNICAL }, user(['technical-tender:review-technical']));
    expect(prisma.tenderReview.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: TenderReviewType.TECHNICAL, organizationId }) }));
  });

  it('counts a required deliverable as complete only with an approved document attachment', async () => {
    const base = {
      id: 'tender', organizationId, title: 'RFP', tenderType: 'RFP', ownerId: user().userId,
      companyId: 'company', submissionDeadline: new Date(Date.now() + 86400000), status: TenderStatus.COMMERCIAL_REVIEW,
      bidDecision: TenderBidDecision.BID, qualificationDecision: TenderQualificationDecision.GO,
      revision: 1, archivedAt: null, requirements: [], reviews: [
        { id: 'commercial', type: TenderReviewType.COMMERCIAL, status: TenderReviewStatus.APPROVED },
        { id: 'technical', type: TenderReviewType.TECHNICAL, status: TenderReviewStatus.APPROVED },
      ],
    };
    prisma.tender.findFirst.mockResolvedValue({ ...base, deliverables: [{ required: true, document: { status: 'APPROVED', versions: [] } }] });
    await expect(service.getTenderReadiness('tender', user())).resolves.toMatchObject({ overallReady: false, checks: { deliverables: { missing: 1 } } });
    prisma.tender.findFirst.mockResolvedValue({ ...base, deliverables: [{ required: true, document: { status: 'APPROVED', versions: [{ attachmentId: 'file' }] } }] });
    await expect(service.getTenderReadiness('tender', user())).resolves.toMatchObject({ overallReady: true, checks: { deliverables: { missing: 0 } } });
  });

  it('decides a review and advances the tender revision atomically', async () => {
    const tender = { id: 'tender', organizationId, title: 'RFP', ownerId: user().userId, status: TenderStatus.TECHNICAL_REVIEW, revision: 4, archivedAt: null, requirements: [], deliverables: [], reviews: [] };
    const pending = { id: 'review', tenderId: 'tender', organizationId, type: TenderReviewType.TECHNICAL, status: TenderReviewStatus.PENDING };
    prisma.tender.findFirst.mockResolvedValue(tender);
    prisma.tenderReview.findFirst.mockResolvedValue(pending);
    prisma.tenderReview.findUniqueOrThrow.mockResolvedValue({ ...pending, status: TenderReviewStatus.APPROVED });
    await service.decideTenderReview('tender', 'review', { status: TenderReviewStatus.APPROVED, revision: 4 }, user(['technical-tender:review-technical']));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.tender.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'tender', organizationId, revision: 4 } }));
    expect(prisma.tenderReview.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId, status: TenderReviewStatus.PENDING }) }));
  });

  it('requires reasons for lost and cancelled close actions', async () => {
    prisma.tender.findFirst.mockResolvedValue({ id: 'tender', organizationId, status: TenderStatus.UNDER_EVALUATION, revision: 1, archivedAt: null, requirements: [], deliverables: [], reviews: [] });
    await expect(service.transitionTender('tender', { status: TenderStatus.WON, revision: 1 }, user(['technical-tender:manage'])))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.transitionTender('tender', { status: TenderStatus.LOST, revision: 1 }, user(['technical-tender:close'])))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'TENDER_CLOSE_REASON_REQUIRED' }) });
  });

  it('does not expose large article bodies in audit snapshots', async () => {
    const article = { id: 'kb', organizationId, title: 'KB', slug: 'kb', content: 'sensitive long body', status: KnowledgeBaseStatus.IN_REVIEW, archivedAt: null };
    prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(article);
    prisma.knowledgeBaseArticle.update.mockResolvedValue({ ...article, status: KnowledgeBaseStatus.PUBLISHED });
    await service.transitionKnowledge('kb', { status: 'PUBLISHED' }, user(['technical-knowledge:publish']));
    const call = audit.recordTenantEvent.mock.calls.at(-1)[0];
    expect(call.before).not.toHaveProperty('content');
    expect(call.after).not.toHaveProperty('content');
  });
});
