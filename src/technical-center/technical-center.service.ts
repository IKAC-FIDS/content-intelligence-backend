import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  FileAttachmentEntityType,
  KnowledgeBaseStatus,
  KnowledgeContentType,
  NotificationEntityType,
  NotificationPriority,
  NotificationType,
  Prisma,
  TechnicalDocumentStatus,
  TechnicalReleaseStatus,
  TechnicalResourceStatus,
  TechnicalResourceType,
  TenderResult,
  TenderBidDecision,
  TenderQualificationDecision,
  TenderRequirementStatus,
  TenderReviewStatus,
  TenderReviewType,
  TenderStatus,
  TenderType,
} from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { parseApiDate, parseApiDateRange } from '../common/dates/api-date.util';
import { getCurrentOrganizationId } from '../common/tenant/tenant-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from '../tasks/tasks.service';
import {
  CreateDeliverableDto,
  CreateDocumentDto,
  CreateDocumentVersionDto,
  CreateKnowledgeDto,
  CreateReleaseDto,
  CreateRequirementDto,
  CreateRequirementTaskDto,
  CreateResourceDto,
  CreateTenderDto,
  DecideTenderReviewDto,
  RequestTenderReviewDto,
  RequirementDependencyDto,
  LinkRequirementTaskDto,
  TechnicalListDto,
  TechnicalDocumentListDto,
  TransitionDto,
  UpdateDocumentDto,
  UpdateKnowledgeDto,
  UpdateReleaseDto,
  UpdateRequirementDto,
  UpdateResourceDto,
  UpdateTenderDto,
  UpdateTenderQualificationDto,
} from './dto/technical-center.dto';
import {
  assertTransition,
  documentTransitions,
  knowledgeTransitions,
  releaseTransitions,
  tenderTransitions,
} from './technical-lifecycle.policy';

const documentVersionInclude = {
  attachment: { select: { id: true, name: true, originalFileName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true, deletedAt: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
  approvedBy: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.TechnicalDocumentVersionInclude;

const documentRelations = {
  product: { select: { id: true, name: true, type: true } },
  release: { select: { id: true, version: true, title: true } },
  company: { select: { id: true, legalName: true, brandName: true } },
  opportunity: { select: { id: true, title: true } },
  owner: { select: { id: true, fullName: true, email: true } },
};

const documentInclude = {
  ...documentRelations,
  versions: { include: documentVersionInclude, orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.TechnicalDocumentInclude;

const documentListInclude = {
  ...documentRelations,
  versions: { include: documentVersionInclude, orderBy: { createdAt: 'desc' as const }, take: 1 },
} satisfies Prisma.TechnicalDocumentInclude;

const releaseDetailInclude = {
  product: { select: { id: true, name: true, type: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
  updatedBy: { select: { id: true, fullName: true, email: true } },
  _count: { select: { knowledgeArticles: true, technicalDocuments: true, technicalResources: true } },
} satisfies Prisma.TechnicalReleaseInclude;

const knowledgeRelations = {
  product: { select: { id: true, name: true, type: true } },
  release: { select: { id: true, version: true, title: true } },
  owner: { select: { id: true, fullName: true, email: true } },
  author: { select: { id: true, fullName: true, email: true } },
  reviewer: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.KnowledgeBaseArticleInclude;

const resourceRelations = {
  product: { select: { id: true, name: true, type: true } },
  release: { select: { id: true, version: true, title: true } },
  owner: { select: { id: true, fullName: true, email: true } },
  attachment: { select: { id: true, name: true, originalFileName: true, mimeType: true, sizeBytes: true, sha256: true, deletedAt: true } },
} satisfies Prisma.TechnicalResourceInclude;

const tenderInclude = {
  company: { select: { id: true, legalName: true, brandName: true } },
  opportunity: { select: { id: true, title: true } },
  team: { select: { id: true, code: true, name: true } },
  owner: { select: { id: true, fullName: true, email: true } },
  technicalLead: { select: { id: true, fullName: true, email: true } },
  commercialLead: { select: { id: true, fullName: true, email: true } },
  requirements: { include: {
    owner: { select: { id: true, fullName: true, email: true } },
    task: { select: { id: true, title: true, status: true, assignedToId: true } },
    dependencies: { include: { dependsOnRequirement: { select: { id: true, title: true, referenceId: true, status: true } } } },
  }, orderBy: { createdAt: 'asc' as const } },
  deliverables: { include: { document: { select: { id: true, title: true, status: true, versions: { select: { id: true, attachmentId: true }, take: 1, orderBy: { createdAt: 'desc' as const } } } } } },
  reviews: {
    include: {
      reviewer: { select: { id: true, fullName: true, email: true } },
      requestedBy: { select: { id: true, fullName: true, email: true } },
      decidedBy: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.TenderInclude;

@Injectable()
export class TechnicalCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    @Optional() private readonly notifications?: NotificationsService,
    private readonly tasks?: TasksService,
  ) {}

  async listReleases(query: TechnicalListDto, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    const where: Prisma.TechnicalReleaseWhereInput = {
      organizationId,
      archivedAt: null,
      ...(query.productId && { productId: query.productId }),
      ...(query.version && { version: { contains: query.version.trim(), mode: 'insensitive' } }),
      ...(query.status && { status: this.enumValue(TechnicalReleaseStatus, query.status, 'status') }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { version: { contains: query.search, mode: 'insensitive' } },
          { summary: { contains: query.search, mode: 'insensitive' } },
          { product: { name: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
      ...(this.range(query) && { releaseDate: this.range(query) }),
    };
    return this.page(query, () => this.prisma.technicalRelease.findMany({
      where,
      include: { product: { select: { id: true, name: true, type: true } } },
      orderBy: this.sort(query, ['updatedAt', 'releaseDate', 'title', 'version'], 'updatedAt'),
      skip: this.skip(query), take: query.limit,
    }), () => this.prisma.technicalRelease.count({ where }));
  }

  async getRelease(id: string, user: CurrentUserPayload) {
    const row = await this.prisma.technicalRelease.findFirst({
      where: { id, organizationId: getCurrentOrganizationId(user) },
      include: releaseDetailInclude,
    });
    if (!row) throw new NotFoundException('Technical release not found');
    return row;
  }

  async createRelease(dto: CreateReleaseDto, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    await this.assertProduct(dto.productId);
    await this.assertReleaseVersionAvailable(organizationId, dto.productId, dto.version);
    const schedule = this.releaseSchedule(dto);
    const row = await this.prisma.technicalRelease.create({ data: {
      organizationId, productId: dto.productId, version: dto.version.trim(), title: dto.title.trim(),
      summary: dto.summary?.trim(), releaseNotes: dto.releaseNotes?.trim(),
      ...schedule,
      createdById: user.userId, updatedById: user.userId,
    }, include: releaseDetailInclude });
    await this.log('technical-release', row.id, 'technical-release.created', organizationId, user, undefined, row);
    return row;
  }

  async updateRelease(id: string, dto: UpdateReleaseDto, user: CurrentUserPayload) {
    const current = await this.getRelease(id, user);
    this.assertMutable(current.archivedAt);
    if (
      (current.status === TechnicalReleaseStatus.RELEASED ||
        current.status === TechnicalReleaseStatus.DEPRECATED ||
        current.status === TechnicalReleaseStatus.END_OF_LIFE) &&
      ((dto.productId !== undefined && dto.productId !== current.productId) ||
        (dto.version !== undefined && dto.version.trim() !== current.version))
    ) {
      throw new BadRequestException({
        code: 'RELEASE_IDENTITY_LOCKED',
        message: 'پس از انتشار، محصول و شماره نسخه قابل تغییر نیستند.',
      });
    }
    if (dto.productId) await this.assertProduct(dto.productId);
    if (dto.productId || dto.version) {
      await this.assertReleaseVersionAvailable(
        current.organizationId,
        dto.productId ?? current.productId,
        dto.version ?? current.version,
        id,
      );
    }
    const { revision, ...input } = dto;
    const schedule = this.releaseSchedule(dto, current);
    await this.optimistic('technicalRelease', id, current.organizationId, revision ?? current.revision, {
      ...input,
      version: input.version?.trim(), title: input.title?.trim(), summary: input.summary?.trim(),
      releaseNotes: input.releaseNotes?.trim(),
      ...(input.releaseDate !== undefined && { releaseDate: schedule.releaseDate }),
      ...(input.supportStartDate !== undefined && { supportStartDate: schedule.supportStartDate }),
      ...(input.supportEndDate !== undefined && { supportEndDate: schedule.supportEndDate }),
      ...(input.endOfLifeDate !== undefined && { endOfLifeDate: schedule.endOfLifeDate }),
      updatedById: user.userId,
    });
    const row = await this.getRelease(id, user);
    await this.log('technical-release', id, 'technical-release.updated', current.organizationId, user, current, row);
    return row;
  }

  async transitionRelease(id: string, dto: TransitionDto, user: CurrentUserPayload) {
    const current = await this.getRelease(id, user);
    const target = this.enumValue(TechnicalReleaseStatus, dto.status, 'status');
    assertTransition('technical-release', releaseTransitions, current.status, target);
    if (['RELEASED', 'DEPRECATED', 'END_OF_LIFE'].includes(target)) this.require(user, 'technical-release:publish');
    if (
      (target === TechnicalReleaseStatus.PLANNED ||
        target === TechnicalReleaseStatus.RELEASED) &&
      !current.releaseDate
    ) {
      throw new BadRequestException({
        code: 'RELEASE_DATE_REQUIRED',
        message: 'برای برنامه‌ریزی یا انتشار نسخه، تاریخ انتشار را مشخص کنید.',
      });
    }
    if (
      target === TechnicalReleaseStatus.RELEASED &&
      current.releaseDate &&
      current.releaseDate.getTime() > Date.now()
    ) {
      throw new BadRequestException({
        code: 'RELEASE_DATE_IN_FUTURE',
        message: 'تا پیش از رسیدن تاریخ برنامه‌ریزی‌شده، امکان ثبت وضعیت منتشرشده وجود ندارد.',
      });
    }
    if (
      (target === TechnicalReleaseStatus.DEPRECATED ||
        target === TechnicalReleaseStatus.END_OF_LIFE ||
        target === TechnicalReleaseStatus.ARCHIVED) &&
      !dto.reason?.trim()
    ) {
      throw new BadRequestException({
        code: 'RELEASE_TRANSITION_REASON_REQUIRED',
        message: 'ثبت دلیل برای این تغییر وضعیت الزامی است.',
      });
    }
    await this.optimistic('technicalRelease', id, current.organizationId, dto.revision ?? current.revision, {
      status: target, updatedById: user.userId,
      ...(target === TechnicalReleaseStatus.RELEASED && !current.releaseDate && { releaseDate: new Date() }),
      ...(target === TechnicalReleaseStatus.ARCHIVED && { archivedAt: new Date() }),
    });
    const row = await this.getRelease(id, user);
    const action = target === 'ARCHIVED' ? 'technical-release.archived' : `technical-release.${target.toLowerCase()}`;
    await this.log('technical-release', id, action, current.organizationId, user, current, row, dto.reason);
    return row;
  }

  async listKnowledge(query: TechnicalListDto, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    const now = new Date();
    const where: Prisma.KnowledgeBaseArticleWhereInput = {
      organizationId, archivedAt: null,
      ...(query.productId && { productId: query.productId }),
      ...(query.releaseId && { releaseId: query.releaseId }),
      ...(query.ownerId && { ownerId: query.ownerId }),
      ...(query.authorId && { authorId: query.authorId }),
      ...(query.category && { category: { contains: query.category.trim(), mode: 'insensitive' } }),
      ...(query.visibility && { visibility: query.visibility }),
      ...(query.reviewDue === 'true' && { nextReviewAt: { lte: now } }),
      ...(query.reviewDue === 'false' && { AND: [{ OR: [{ nextReviewAt: null }, { nextReviewAt: { gt: now } }] }] }),
      ...(query.status && { status: this.enumValue(KnowledgeBaseStatus, query.status, 'status') }),
      ...(query.search && { OR: [
        { title: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
        { summary: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
        { category: { contains: query.search, mode: 'insensitive' } },
        { product: { name: { contains: query.search, mode: 'insensitive' } } },
        { release: { title: { contains: query.search, mode: 'insensitive' } } },
      ] }),
    };
    return this.page(query, () => this.prisma.knowledgeBaseArticle.findMany({ where, include: knowledgeRelations, orderBy: this.sort(query, ['updatedAt', 'title', 'nextReviewAt', 'publishedAt'], 'updatedAt'), skip: this.skip(query), take: query.limit }), () => this.prisma.knowledgeBaseArticle.count({ where }));
  }

  async listKnowledgeCategories(search: string | undefined, user: CurrentUserPayload) {
    const rows = await this.prisma.knowledgeBaseArticle.findMany({
      where: {
        organizationId: getCurrentOrganizationId(user),
        archivedAt: null,
        category: {
          not: null,
          ...(search?.trim() && { contains: search.trim(), mode: 'insensitive' }),
        },
      },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
      take: 50,
    });
    return rows
      .map((row) => row.category?.trim())
      .filter((category): category is string => Boolean(category))
      .map((category) => ({ id: category, label: category }));
  }

  async getKnowledge(id: string, user: CurrentUserPayload) {
    const row = await this.prisma.knowledgeBaseArticle.findFirst({
      where: { id, organizationId: getCurrentOrganizationId(user) },
      include: knowledgeRelations,
    });
    if (!row) throw new NotFoundException('Knowledge article not found');
    return row;
  }

  async createKnowledge(dto: CreateKnowledgeDto, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    const contentSource = this.normalizeKnowledgeContent(dto);
    await this.validateLinks(organizationId, dto);
    await this.assertKnowledgeSlugAvailable(organizationId, dto.slug);
    const row = await this.prisma.knowledgeBaseArticle.create({ data: {
      ...dto, ...contentSource, title: dto.title.trim(), slug: dto.slug.trim().toLowerCase(),
      summary: this.nullableTrim(dto.summary), category: this.nullableTrim(dto.category), nextReviewAt: this.nullableDate(dto.nextReviewAt, 'nextReviewAt'),
      organizationId, authorId: user.userId,
    }, include: knowledgeRelations });
    await this.log('technical-knowledge', row.id, 'technical-knowledge.created', organizationId, user, undefined, row);
    return row;
  }

  async updateKnowledge(id: string, dto: UpdateKnowledgeDto, user: CurrentUserPayload) {
    const current = await this.getKnowledge(id, user);
    this.assertMutable(current.archivedAt);
    if (current.status === KnowledgeBaseStatus.PUBLISHED) {
      throw new BadRequestException({
        code: 'PUBLISHED_KNOWLEDGE_LOCKED',
        message: 'برای ویرایش مقاله منتشرشده، ابتدا آن را به وضعیت بازبینی برگردانید.',
      });
    }
    const links = dto.productId !== undefined || dto.releaseId !== undefined
      ? {
          ...dto,
          productId: dto.productId !== undefined ? dto.productId : current.productId,
          releaseId: dto.releaseId !== undefined ? dto.releaseId : current.releaseId,
        }
      : dto;
    await this.validateLinks(current.organizationId, links);
    const contentSource = this.normalizeKnowledgeContent(dto, current);
    if (dto.slug !== undefined) await this.assertKnowledgeSlugAvailable(current.organizationId, dto.slug, id);
    const row = await this.prisma.knowledgeBaseArticle.update({ where: { id }, data: {
      ...dto, ...contentSource, title: dto.title?.trim(), slug: dto.slug?.trim().toLowerCase(),
      summary: this.nullableTrim(dto.summary), category: this.nullableTrim(dto.category), nextReviewAt: this.nullableDate(dto.nextReviewAt, 'nextReviewAt'),
    }, include: knowledgeRelations });
    await this.log('technical-knowledge', id, 'technical-knowledge.updated', current.organizationId, user, current, row);
    return row;
  }

  async transitionKnowledge(id: string, dto: TransitionDto, user: CurrentUserPayload) {
    const current = await this.getKnowledge(id, user);
    const target = this.enumValue(KnowledgeBaseStatus, dto.status, 'status');
    assertTransition('technical-knowledge', knowledgeTransitions, current.status, target);
    if (target === KnowledgeBaseStatus.PUBLISHED) this.require(user, 'technical-knowledge:publish');
    if (target === KnowledgeBaseStatus.ARCHIVED && !dto.reason?.trim()) {
      throw new BadRequestException({
        code: 'KNOWLEDGE_ARCHIVE_REASON_REQUIRED',
        message: 'برای بایگانی مقاله، ثبت دلیل الزامی است.',
      });
    }
    if (target === KnowledgeBaseStatus.PUBLISHED && current.nextReviewAt && current.nextReviewAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'KNOWLEDGE_REVIEW_DATE_INVALID',
        message: 'تاریخ بازبینی بعدی مقاله باید در آینده باشد.',
      });
    }
    const now = new Date();
    const row = await this.prisma.knowledgeBaseArticle.update({ where: { id }, data: {
      status: target,
      ...(target === KnowledgeBaseStatus.PUBLISHED && { publishedAt: now, lastReviewedAt: now }),
      ...(target === KnowledgeBaseStatus.ARCHIVED && { archivedAt: now }),
    }, include: knowledgeRelations });
    const action = target === 'PUBLISHED' ? 'technical-knowledge.published' : target === 'ARCHIVED' ? 'technical-knowledge.archived' : 'technical-knowledge.transitioned';
    await this.log('technical-knowledge', id, action, current.organizationId, user, current, row, dto.reason);
    return row;
  }

  async listDocuments(query: TechnicalDocumentListDto, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    const where: Prisma.TechnicalDocumentWhereInput = {
      organizationId, archivedAt: null,
      ...(query.productId && { productId: query.productId }), ...(query.releaseId && { releaseId: query.releaseId }),
      ...(query.companyId && { companyId: query.companyId }), ...(query.opportunityId && { opportunityId: query.opportunityId }),
      ...(query.tenderId && { tenderId: query.tenderId }),
      ...(query.ownerId && { ownerId: query.ownerId }), ...(query.type && { documentType: query.type }),
      ...(query.confidentiality && { confidentiality: query.confidentiality }),
      ...(query.status && { status: this.enumValue(TechnicalDocumentStatus, query.status, 'status') }),
      ...(query.search && { OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }] }),
    };
    return this.page(query, () => this.prisma.technicalDocument.findMany({ where, include: documentListInclude, orderBy: this.sort(query, ['updatedAt', 'title', 'effectiveFrom', 'expiresAt'], 'updatedAt'), skip: this.skip(query), take: query.limit }), () => this.prisma.technicalDocument.count({ where }));
  }

  async getDocument(id: string, user: CurrentUserPayload) {
    const row = await this.prisma.technicalDocument.findFirst({ where: { id, organizationId: getCurrentOrganizationId(user) }, include: documentInclude });
    if (!row) throw new NotFoundException('Technical document not found');
    return row;
  }

  async createDocument(dto: CreateDocumentDto, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    await this.validateLinks(organizationId, dto);
    const row = await this.prisma.technicalDocument.create({ data: {
      ...dto, title: dto.title.trim(), documentType: dto.documentType.trim(), description: dto.description?.trim(),
      effectiveFrom: this.date(dto.effectiveFrom, 'effectiveFrom'), expiresAt: this.date(dto.expiresAt, 'expiresAt'),
      organizationId, createdById: user.userId, updatedById: user.userId,
    }, include: documentInclude });
    await this.log('technical-document', row.id, 'technical-document.created', organizationId, user, undefined, row);
    return row;
  }

  async updateDocument(id: string, dto: UpdateDocumentDto, user: CurrentUserPayload) {
    const current = await this.getDocument(id, user);
    this.assertMutable(current.archivedAt);
    const links = dto.productId !== undefined || dto.releaseId !== undefined
      ? { ...dto, productId: dto.productId ?? current.productId, releaseId: dto.releaseId ?? current.releaseId }
      : dto;
    await this.validateLinks(current.organizationId, links);
    const { revision, ...input } = dto;
    await this.optimistic('technicalDocument', id, current.organizationId, revision ?? current.revision, {
      ...input, title: input.title?.trim(), documentType: input.documentType?.trim(), description: input.description?.trim(),
      effectiveFrom: this.date(input.effectiveFrom, 'effectiveFrom'), expiresAt: this.date(input.expiresAt, 'expiresAt'), updatedById: user.userId,
    });
    const row = await this.getDocument(id, user);
    await this.log('technical-document', id, 'technical-document.updated', current.organizationId, user, current, row);
    return row;
  }

  async transitionDocument(id: string, dto: TransitionDto, user: CurrentUserPayload) {
    const current = await this.getDocument(id, user);
    const target = this.enumValue(TechnicalDocumentStatus, dto.status, 'status');
    assertTransition('technical-document', documentTransitions, current.status, target);
    if (['APPROVED', 'ACTIVE', 'SUPERSEDED'].includes(target)) this.require(user, 'technical-document:approve');
    if (
      target === TechnicalDocumentStatus.IN_REVIEW ||
      target === TechnicalDocumentStatus.APPROVED
    ) {
      const latest = await this.prisma.technicalDocumentVersion.findFirst({
        where: { organizationId: current.organizationId, documentId: id },
        orderBy: { createdAt: 'desc' },
        include: { attachment: { select: { id: true, deletedAt: true } } },
      });
      if (!latest?.attachment || latest.attachment.deletedAt) {
        throw new BadRequestException({
          code: 'DOCUMENT_VERSION_FILE_REQUIRED',
          message: 'برای ارسال سند به بازبینی، ابتدا یک نسخه دارای فایل بارگذاری کنید.',
        });
      }
    }
    await this.optimistic('technicalDocument', id, current.organizationId, dto.revision ?? current.revision, {
      status: target, updatedById: user.userId,
      ...(target === TechnicalDocumentStatus.ACTIVE && !current.effectiveFrom && { effectiveFrom: new Date() }),
      ...(target === TechnicalDocumentStatus.ARCHIVED && { archivedAt: new Date() }),
    });
    if (target === TechnicalDocumentStatus.APPROVED) {
      const latest = await this.prisma.technicalDocumentVersion.findFirst({
        where: { organizationId: current.organizationId, documentId: id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, approvedAt: true },
      });
      if (latest && !latest.approvedAt) {
        await this.prisma.technicalDocumentVersion.update({
          where: { id: latest.id },
          data: { approvedById: user.userId, approvedAt: new Date(), approvalNote: dto.reason?.trim() },
        });
      }
    }
    const row = await this.getDocument(id, user);
    const action = ['APPROVED', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED'].includes(target)
      ? `technical-document.${target.toLowerCase()}`
      : 'technical-document.transitioned';
    await this.log('technical-document', id, action, current.organizationId, user, current, row, dto.reason);
    return row;
  }

  async addDocumentVersion(documentId: string, dto: CreateDocumentVersionDto, user: CurrentUserPayload) {
    const document = await this.getDocument(documentId, user);
    this.assertMutable(document.archivedAt);
    if (
      document.status !== TechnicalDocumentStatus.DRAFT &&
      document.status !== TechnicalDocumentStatus.IN_REVIEW
    ) {
      throw new BadRequestException({
        code: 'DOCUMENT_VERSION_LOCKED',
        message: 'افزودن نسخه فقط برای سند پیش‌نویس یا در حال بازبینی امکان‌پذیر است.',
      });
    }
    const duplicate = await this.prisma.technicalDocumentVersion.findFirst({
      where: { organizationId: document.organizationId, documentId, version: dto.version.trim() },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'DUPLICATE_DOCUMENT_VERSION',
        message: 'این شماره نسخه قبلاً برای سند ثبت شده است.',
      });
    }
    if (dto.attachmentId) await this.assertAttachment(document.organizationId, dto.attachmentId, FileAttachmentEntityType.TECHNICAL_DOCUMENT, documentId);
    const row = await this.prisma.technicalDocumentVersion.create({ data: {
      organizationId: document.organizationId, documentId, version: dto.version.trim(), attachmentId: dto.attachmentId,
      contentHash: dto.contentHash?.trim(), createdById: user.userId,
    }});
    await this.log('technical-document-version', row.id, 'technical-document.version-created', document.organizationId, user, undefined, row);
    return row;
  }

  async listDocumentVersions(documentId: string, user: CurrentUserPayload) {
    const document = await this.getDocument(documentId, user);
    return this.prisma.technicalDocumentVersion.findMany({
      where: { organizationId: document.organizationId, documentId },
      include: documentVersionInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocumentVersion(documentId: string, versionId: string, user: CurrentUserPayload) {
    const document = await this.getDocument(documentId, user);
    const row = await this.prisma.technicalDocumentVersion.findFirst({
      where: { id: versionId, organizationId: document.organizationId, documentId },
      include: documentVersionInclude,
    });
    if (!row) throw new NotFoundException('Technical document version not found');
    return row;
  }

  async listResources(query: TechnicalListDto, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    const where: Prisma.TechnicalResourceWhereInput = {
      organizationId, archivedAt: null,
      ...(query.productId && { productId: query.productId }), ...(query.releaseId && { releaseId: query.releaseId }),
      ...(query.ownerId && { ownerId: query.ownerId }),
      ...(query.status && { status: this.enumValue(TechnicalResourceStatus, query.status, 'status') }),
      ...(query.type && { resourceType: this.enumValue(TechnicalResourceType, query.type, 'type') }),
      ...(query.search && { OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }] }),
    };
    const page = await this.page(query, () => this.prisma.technicalResource.findMany({ where, include: resourceRelations, orderBy: this.sort(query, ['updatedAt', 'title', 'version'], 'updatedAt'), skip: this.skip(query), take: query.limit }), () => this.prisma.technicalResource.count({ where }));
    return { ...page, data: await this.withResourceArtifactCounts(page.data, organizationId) };
  }

  async getResource(id: string, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    const row = await this.prisma.technicalResource.findFirst({ where: { id, organizationId }, include: resourceRelations });
    if (!row) throw new NotFoundException('Technical resource not found');
    return (await this.withResourceArtifactCounts([row], organizationId))[0];
  }

  async createResource(dto: CreateResourceDto, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    this.assertResourceSource(dto.resourceType, dto.url);
    await this.validateLinks(organizationId, dto);
    const row = await this.prisma.technicalResource.create({ data: {
      ...dto, title: dto.title.trim(), description: dto.description?.trim(), version: dto.version?.trim(), checksum: dto.checksum?.trim(),
      organizationId, createdById: user.userId, updatedById: user.userId,
    }, include: resourceRelations });
    await this.log('technical-resource', row.id, 'technical-resource.created', organizationId, user, undefined, row);
    return row;
  }

  async updateResource(id: string, dto: UpdateResourceDto, user: CurrentUserPayload) {
    const current = await this.getResource(id, user);
    this.assertMutable(current.archivedAt);
    this.assertResourceSource(dto.resourceType ?? current.resourceType, dto.url ?? current.url);
    const links = dto.productId !== undefined || dto.releaseId !== undefined
      ? { ...dto, productId: dto.productId ?? current.productId, releaseId: dto.releaseId ?? current.releaseId }
      : dto;
    await this.validateLinks(current.organizationId, links);
    if (dto.attachmentId) await this.assertAttachment(current.organizationId, dto.attachmentId, FileAttachmentEntityType.TECHNICAL_RESOURCE, id);
    const row = await this.prisma.technicalResource.update({ where: { id }, data: {
      ...dto, title: dto.title?.trim(), description: dto.description?.trim(), version: dto.version?.trim(), checksum: dto.checksum?.trim(),
      updatedById: user.userId, ...(dto.status === 'ARCHIVED' && { archivedAt: new Date() }),
    }});
    const action = dto.status === 'DEPRECATED' ? 'technical-resource.deprecated' : dto.status === 'ARCHIVED' ? 'technical-resource.archived' : 'technical-resource.updated';
    await this.log('technical-resource', id, action, current.organizationId, user, current, row);
    return row;
  }

  async listTenders(query: TechnicalListDto, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    const where: Prisma.TenderWhereInput = {
      organizationId, archivedAt: null,
      ...(query.companyId && { companyId: query.companyId }), ...(query.opportunityId && { opportunityId: query.opportunityId }),
      ...(query.ownerId && { ownerId: query.ownerId }), ...(query.teamId && { teamId: query.teamId }),
      ...(query.status && { status: this.enumValue(TenderStatus, query.status, 'status') }),
      ...(query.type && { tenderType: this.enumValue(TenderType, query.type, 'type') }),
      ...(query.search && { OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { referenceNumber: { contains: query.search, mode: 'insensitive' } }] }),
      ...(this.range(query) && { submissionDeadline: this.range(query) }),
    };
    const page = await this.page(query, () => this.prisma.tender.findMany({ where, include: tenderInclude, orderBy: this.sort(query, ['updatedAt', 'title', 'submissionDeadline', 'estimatedValue'], 'updatedAt'), skip: this.skip(query), take: query.limit }), () => this.prisma.tender.count({ where }));
    return { ...page, data: page.data.map((row) => ({ ...row, readiness: this.evaluateReadiness(row) })) };
  }

  async getTender(id: string, user: CurrentUserPayload) {
    const row = await this.prisma.tender.findFirst({ where: { id, organizationId: getCurrentOrganizationId(user) }, include: tenderInclude });
    if (!row) throw new NotFoundException('Technical tender not found');
    return { ...row, readiness: this.evaluateReadiness(row) };
  }

  async createTender(dto: CreateTenderDto, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    await this.validateLinks(organizationId, dto);
    const row = await this.prisma.tender.create({ data: {
      ...dto, title: dto.title.trim(), referenceNumber: dto.referenceNumber?.trim(), description: dto.description?.trim(), source: dto.source?.trim(),
      submissionDeadline: this.date(dto.submissionDeadline, 'submissionDeadline'), technicalDeadline: this.date(dto.technicalDeadline, 'technicalDeadline'),
      expectedDecisionDate: this.date(dto.expectedDecisionDate, 'expectedDecisionDate'),
      estimatedValue: dto.estimatedValue === undefined ? undefined : new Prisma.Decimal(dto.estimatedValue), currency: dto.currency?.toUpperCase(),
      organizationId, createdById: user.userId, updatedById: user.userId,
    }, include: tenderInclude });
    await this.log('technical-tender', row.id, 'technical-tender.created', organizationId, user, undefined, row);
    return row;
  }

  async updateTender(id: string, dto: UpdateTenderDto, user: CurrentUserPayload) {
    const current = await this.getTender(id, user);
    this.assertMutable(current.archivedAt);
    await this.validateLinks(current.organizationId, dto);
    const { revision, ...input } = dto;
    await this.optimistic('tender', id, current.organizationId, revision ?? current.revision, {
      ...input, title: input.title?.trim(), referenceNumber: input.referenceNumber?.trim(), description: input.description?.trim(), source: input.source?.trim(),
      submissionDeadline: this.date(input.submissionDeadline, 'submissionDeadline'), technicalDeadline: this.date(input.technicalDeadline, 'technicalDeadline'),
      expectedDecisionDate: this.date(input.expectedDecisionDate, 'expectedDecisionDate'),
      estimatedValue: input.estimatedValue === undefined ? undefined : new Prisma.Decimal(input.estimatedValue), currency: input.currency?.toUpperCase(), updatedById: user.userId,
    });
    const row = await this.getTender(id, user);
    await this.log('technical-tender', id, 'technical-tender.updated', current.organizationId, user, current, row);
    return row;
  }

  async updateTenderQualification(id: string, dto: UpdateTenderQualificationDto, user: CurrentUserPayload) {
    const current = await this.getTender(id, user);
    this.assertTenderOpen(current.status);
    const nextDecision = dto.qualificationDecision ?? current.qualificationDecision;
    const nextBidDecision = dto.bidDecision ?? current.bidDecision;
    const conditions = dto.qualificationConditions ?? current.qualificationConditions;
    const reason = dto.decisionReason ?? current.decisionReason;
    if (nextDecision === TenderQualificationDecision.CONDITIONAL_GO && !conditions?.trim()) {
      throw new BadRequestException({ code: 'QUALIFICATION_CONDITIONS_REQUIRED', message: 'برای «ادامه مشروط» باید شرایط ادامه را مشخص کنید' });
    }
    if ((nextDecision === TenderQualificationDecision.NO_GO || nextBidDecision === TenderBidDecision.NO_BID) && !reason?.trim()) {
      throw new BadRequestException({ code: 'QUALIFICATION_DECISION_REASON_REQUIRED', message: 'برای «عدم ادامه» یا «شرکت نمی‌کنیم» باید دلیل تصمیم را ثبت کنید' });
    }
    const { revision, ...input } = dto;
    const textFields = ['fitNotes', 'riskNotes', 'feasibilityNotes', 'qualificationSummary', 'qualificationConditions', 'decisionReason'] as const;
    const data: Record<string, unknown> = { ...input, updatedById: user.userId };
    for (const field of textFields) if (input[field] !== undefined) data[field] = input[field]?.trim() || null;
    await this.optimistic('tender', id, current.organizationId, revision ?? current.revision, data);
    const row = await this.getTender(id, user);
    await this.log('technical-tender', id, 'technical-tender.qualification-updated', current.organizationId, user, current, row);
    return row;
  }

  async transitionTender(id: string, dto: TransitionDto, user: CurrentUserPayload) {
    const current = await this.getTender(id, user);
    const target = this.enumValue(TenderStatus, dto.status, 'status');
    assertTransition('technical-tender', tenderTransitions, current.status, target);
    if (target === TenderStatus.SUBMITTED) this.require(user, 'technical-tender:submit');
    if (['WON', 'LOST', 'CANCELLED', 'ARCHIVED'].includes(target)) this.require(user, 'technical-tender:close');
    if ((target === TenderStatus.LOST || target === TenderStatus.CANCELLED) && !dto.reason?.trim()) {
      throw new BadRequestException({ code: 'TENDER_CLOSE_REASON_REQUIRED', message: 'برای ثبت نتیجه «از دست رفته» یا لغو مناقصه باید دلیل را وارد کنید' });
    }
    if (this.isReopen(current.status, target) && !dto.reason?.trim()) {
      throw new BadRequestException({ code: 'TENDER_REOPEN_REASON_REQUIRED', message: 'برای بازگشت به مرحله قبل باید دلیل اصلاح را ثبت کنید' });
    }
    if (current.status === TenderStatus.QUALIFICATION && target === TenderStatus.PREPARING) {
      if (current.bidDecision !== TenderBidDecision.BID) {
        throw new BadRequestException({ code: 'TENDER_BID_DECISION_REQUIRED', message: 'برای ورود به آماده‌سازی، تصمیم شرکت در مناقصه باید «شرکت می‌کنیم» باشد' });
      }
      if (!([TenderQualificationDecision.GO, TenderQualificationDecision.CONDITIONAL_GO] as TenderQualificationDecision[]).includes(current.qualificationDecision)) {
        throw new BadRequestException({ code: 'TENDER_QUALIFICATION_APPROVAL_REQUIRED', message: 'برای ورود به آماده‌سازی، نتیجه ارزیابی اولیه باید «ادامه» یا «ادامه مشروط» باشد' });
      }
    }
    if (current.status === TenderStatus.TECHNICAL_REVIEW && target === TenderStatus.COMMERCIAL_REVIEW) {
      const readiness = this.evaluateReadiness(current);
      if (readiness.checks.technicalReview.status !== TenderReviewStatus.APPROVED) throw new BadRequestException({ code: 'TECHNICAL_REVIEW_NOT_APPROVED', message: 'قبل از ورود به بازبینی تجاری، تأیید فنی را ثبت کنید' });
    }
    if (target === TenderStatus.READY_FOR_SUBMISSION || target === TenderStatus.SUBMITTED) {
      const readiness = this.evaluateReadiness(current);
      if (!readiness.overallReady) throw new BadRequestException({ code: 'TENDER_NOT_READY', message: 'مناقصه هنوز برای ارسال آماده نیست؛ موارد اعلام‌شده را تکمیل کنید', details: { blockers: readiness.blockers, checks: readiness.checks } });
    }
    const result = target === TenderStatus.WON ? TenderResult.WON : target === TenderStatus.LOST ? TenderResult.LOST : target === TenderStatus.CANCELLED ? TenderResult.CANCELLED : undefined;
    await this.optimistic('tender', id, current.organizationId, dto.revision ?? current.revision, {
      status: target, updatedById: user.userId, ...(result && { result, resultReason: dto.reason?.trim() }),
      ...(target === TenderStatus.SUBMITTED && { submittedAt: new Date(), submittedById: user.userId }),
      ...((target === TenderStatus.WON || target === TenderStatus.LOST || target === TenderStatus.CANCELLED) && { closedAt: new Date(), closedById: user.userId }),
      ...(target === TenderStatus.ARCHIVED && { archivedAt: new Date() }),
    });
    const row = await this.getTender(id, user);
    const named = ['SUBMITTED', 'WON', 'LOST', 'CANCELLED', 'ARCHIVED'].includes(target);
    await this.log('technical-tender', id, named ? `technical-tender.${target.toLowerCase()}` : 'technical-tender.transitioned', current.organizationId, user, current, row, dto.reason);
    if (target === TenderStatus.SUBMITTED) await this.notifyTender(row.ownerId, user, id, 'مناقصه ارسال شد', row.title);
    return row;
  }

  async addRequirement(tenderId: string, dto: CreateRequirementDto, user: CurrentUserPayload) {
    const tender = await this.getTender(tenderId, user);
    this.assertTenderOpen(tender.status);
    if (dto.ownerId) await this.assertUser(tender.organizationId, dto.ownerId);
    if (dto.parentRequirementId) await this.assertRequirementParent(tenderId, undefined, dto.parentRequirementId, tender.organizationId);
    if (dto.dependencyIds?.length) await this.assertRequirementIds(tenderId, dto.dependencyIds, tender.organizationId);
    if (dto.status === TenderRequirementStatus.BLOCKED && !dto.blockedReason?.trim()) {
      throw new BadRequestException({ code: 'REQUIREMENT_BLOCK_REASON_REQUIRED', message: 'A reason is required when blocking a requirement' });
    }
    const { dependencyIds, ...input } = dto;
    const row = await this.prisma.tenderRequirement.create({ data: {
      ...input, title: dto.title.trim(), category: dto.category?.trim(), description: dto.description?.trim(), response: dto.response?.trim(),
      section: dto.section?.trim(), page: dto.page?.trim(), referenceId: dto.referenceId?.trim(), notes: dto.notes?.trim(), blockedReason: dto.blockedReason?.trim(),
      dueDate: this.date(dto.dueDate, 'dueDate'), organizationId: tender.organizationId, tenderId,
      ...(dto.status === TenderRequirementStatus.BLOCKED && { blockedAt: new Date(), blockedById: user.userId }),
      ...(dependencyIds?.length && { dependencies: { create: [...new Set(dependencyIds)].map((dependsOnRequirementId) => ({ dependsOnRequirementId })) } }),
    }, include: resourceRelations });
    await this.log('tender-requirement', row.id, 'technical-tender.requirement-created', tender.organizationId, user, undefined, row);
    return row;
  }

  async listRequirements(tenderId: string, user: CurrentUserPayload) {
    const tender = await this.getTender(tenderId, user);
    return this.prisma.tenderRequirement.findMany({
      where: { organizationId: tender.organizationId, tenderId },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        task: { select: { id: true, title: true, status: true, assignedToId: true } },
        dependencies: { include: { dependsOnRequirement: { select: { id: true, title: true, referenceId: true, status: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateRequirement(tenderId: string, requirementId: string, dto: UpdateRequirementDto, user: CurrentUserPayload) {
    const tender = await this.getTender(tenderId, user);
    this.assertTenderOpen(tender.status);
    const current = await this.prisma.tenderRequirement.findFirst({ where: { id: requirementId, tenderId, organizationId: tender.organizationId }, include: { dependencies: { select: { dependsOnRequirementId: true } } } });
    if (!current) throw new NotFoundException('Tender requirement not found');
    if (dto.ownerId) await this.assertUser(tender.organizationId, dto.ownerId);
    if (dto.parentRequirementId) await this.assertRequirementParent(tenderId, requirementId, dto.parentRequirementId, tender.organizationId);
    if (dto.dependencyIds) {
      await this.assertRequirementIds(tenderId, dto.dependencyIds, tender.organizationId);
      for (const dependencyId of dto.dependencyIds) await this.assertNoDependencyCycle(tenderId, requirementId, dependencyId, tender.organizationId);
    }
    if (dto.status === TenderRequirementStatus.BLOCKED && !dto.blockedReason?.trim()) {
      throw new BadRequestException({ code: 'REQUIREMENT_BLOCK_REASON_REQUIRED', message: 'A reason is required when blocking a requirement' });
    }
    const { dependencyIds, ...input } = dto;
    const row = await this.prisma.tenderRequirement.update({ where: { id: requirementId }, data: {
      ...input, title: dto.title?.trim(), category: dto.category?.trim(), description: dto.description?.trim(), response: dto.response?.trim(), blockedReason: dto.blockedReason?.trim(), dueDate: this.date(dto.dueDate, 'dueDate'),
      section: dto.section?.trim(), page: dto.page?.trim(), referenceId: dto.referenceId?.trim(), notes: dto.notes?.trim(),
      ...(dependencyIds && { dependencies: { deleteMany: {}, create: [...new Set(dependencyIds)].map((dependsOnRequirementId) => ({ dependsOnRequirementId })) } }),
      ...(dto.status === TenderRequirementStatus.BLOCKED ? { blockedAt: new Date(), blockedById: user.userId } : dto.status ? { blockedAt: null, blockedById: null, blockedReason: null } : {}),
    }});
    const action = dto.status && dto.status !== current.status
      ? 'technical-tender.requirement-status-changed'
      : dto.ownerId !== undefined && dto.ownerId !== current.ownerId
        ? 'technical-tender.requirement-owner-changed'
        : 'technical-tender.requirement-updated';
    await this.log('tender-requirement', row.id, action, tender.organizationId, user, current, row);
    if (dependencyIds) await this.log('tender-requirement', row.id, 'technical-tender.requirement-dependencies-changed', tender.organizationId, user, { id: row.id, tenderId, dependencyIds: current.dependencies.map((dependency) => dependency.dependsOnRequirementId) }, { id: row.id, tenderId, dependencyIds });
    if (dto.status === TenderRequirementStatus.BLOCKED && row.ownerId) await this.notifyTender(row.ownerId, user, tenderId, 'الزام مناقصه مسدود شد', row.title, NotificationPriority.HIGH);
    return row;
  }

  async removeRequirement(tenderId: string, requirementId: string, user: CurrentUserPayload) {
    const tender = await this.getTender(tenderId, user);
    this.assertTenderOpen(tender.status);
    const current = await this.prisma.tenderRequirement.findFirst({ where: { id: requirementId, tenderId, organizationId: tender.organizationId } });
    if (!current) throw new NotFoundException('Tender requirement not found');
    await this.prisma.tenderRequirement.delete({ where: { id: requirementId } });
    await this.log('tender-requirement', requirementId, 'technical-tender.requirement-deleted', tender.organizationId, user, current);
    return { id: requirementId, deleted: true };
  }

  async addRequirementDependency(tenderId: string, requirementId: string, dto: RequirementDependencyDto, user: CurrentUserPayload) {
    const tender = await this.getTender(tenderId, user);
    this.assertTenderOpen(tender.status);
    await this.getRequirement(tenderId, requirementId, tender.organizationId);
    await this.assertRequirementIds(tenderId, [dto.dependsOnRequirementId], tender.organizationId);
    await this.assertNoDependencyCycle(tenderId, requirementId, dto.dependsOnRequirementId, tender.organizationId);
    try {
      const row = await this.prisma.tenderRequirementDependency.create({ data: { requirementId, dependsOnRequirementId: dto.dependsOnRequirementId } });
      await this.log('tender-requirement', requirementId, 'technical-tender.requirement-dependency-added', tender.organizationId, user, undefined, row);
      return row;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'REQUIREMENT_DEPENDENCY_EXISTS', message: 'Dependency already exists' });
      throw error;
    }
  }

  async removeRequirementDependency(tenderId: string, requirementId: string, dependencyId: string, user: CurrentUserPayload) {
    const tender = await this.getTender(tenderId, user);
    this.assertTenderOpen(tender.status);
    const current = await this.prisma.tenderRequirementDependency.findFirst({ where: { id: dependencyId, requirementId, requirement: { tenderId, organizationId: tender.organizationId } } });
    if (!current) throw new NotFoundException('Tender requirement dependency not found');
    await this.prisma.tenderRequirementDependency.delete({ where: { id: dependencyId } });
    await this.log('tender-requirement', requirementId, 'technical-tender.requirement-dependency-removed', tender.organizationId, user, current);
    return { id: dependencyId, deleted: true };
  }

  async linkRequirementTask(tenderId: string, requirementId: string, dto: LinkRequirementTaskDto, user: CurrentUserPayload) {
    const tender = await this.getTender(tenderId, user);
    this.assertTenderOpen(tender.status);
    this.require(user, 'task:view');
    const requirement = await this.getRequirement(tenderId, requirementId, tender.organizationId);
    const task = await this.tasks!.findOne(dto.taskId, user);
    if (task.organizationId !== tender.organizationId) throw new BadRequestException({ code: 'TASK_TENANT_MISMATCH', message: 'Task must belong to the same organization' });
    const row = await this.prisma.tenderRequirement.update({ where: { id: requirementId }, data: { taskId: task.id } });
    await this.log('tender-requirement', requirementId, 'technical-tender.requirement-task-linked', tender.organizationId, user, requirement, row);
    return row;
  }

  async listTenderCurrencyOptions() {
    const rates = await this.prisma.currencyExchangeRate.findMany({
      select: { baseCurrency: true, quoteCurrency: true },
    });
    const codes = new Set<string>(['IRR']);
    for (const rate of rates) {
      if (rate.baseCurrency?.trim()) codes.add(rate.baseCurrency.trim().toUpperCase());
      if (rate.quoteCurrency?.trim()) codes.add(rate.quoteCurrency.trim().toUpperCase());
    }
    return [...codes].sort((left, right) => left === 'IRR' ? -1 : right === 'IRR' ? 1 : left.localeCompare(right)).map((code) => ({ id: code, label: code }));
  }

  async createRequirementTask(tenderId: string, requirementId: string, dto: CreateRequirementTaskDto, user: CurrentUserPayload) {
    const tender = await this.getTender(tenderId, user);
    this.assertTenderOpen(tender.status);
    this.require(user, 'task:create');
    const requirement = await this.getRequirement(tenderId, requirementId, tender.organizationId);
    const reference = requirement.referenceId ? ` [${requirement.referenceId}]` : '';
    const context = `الزام مناقصه «${tender.title}»${reference}`;
    const task = await this.tasks!.create({
      title: dto.title?.trim() || `پیگیری الزام: ${requirement.title}`,
      description: [dto.description?.trim(), context, requirement.description].filter(Boolean).join('\n\n'),
      priority: dto.priority,
      dueAt: dto.dueAt,
      assignedToId: dto.assignedToId,
      assignmentScope: dto.assignmentScope,
      teamId: dto.teamId,
      companyId: tender.companyId ?? undefined,
      opportunityId: tender.opportunityId ?? undefined,
    }, user);
    const row = await this.prisma.tenderRequirement.update({ where: { id: requirementId }, data: { taskId: task.id } });
    await this.log('tender-requirement', requirementId, 'technical-tender.requirement-task-created', tender.organizationId, user, requirement, row);
    return { requirement: row, task };
  }

  async unlinkRequirementTask(tenderId: string, requirementId: string, user: CurrentUserPayload) {
    const tender = await this.getTender(tenderId, user);
    this.assertTenderOpen(tender.status);
    const requirement = await this.getRequirement(tenderId, requirementId, tender.organizationId);
    if (!requirement.taskId) return requirement;
    const row = await this.prisma.tenderRequirement.update({ where: { id: requirementId }, data: { taskId: null } });
    await this.log('tender-requirement', requirementId, 'technical-tender.requirement-task-unlinked', tender.organizationId, user, requirement, row);
    return row;
  }

  async addDeliverable(tenderId: string, dto: CreateDeliverableDto, user: CurrentUserPayload) {
    const tender = await this.getTender(tenderId, user);
    this.assertTenderOpen(tender.status);
    const document = await this.prisma.technicalDocument.findFirst({ where: { id: dto.documentId, organizationId: tender.organizationId, archivedAt: null } });
    if (!document) throw new NotFoundException('Technical document not found');
    const duplicate = await this.prisma.tenderDeliverable.findFirst({
      where: { organizationId: tender.organizationId, tenderId, documentId: dto.documentId },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'DUPLICATE_TENDER_DELIVERABLE',
        message: 'این سند قبلاً به اقلام تحویلی مناقصه متصل شده است.',
      });
    }
    const row = await this.prisma.tenderDeliverable.create({ data: { organizationId: tender.organizationId, tenderId, documentId: dto.documentId, label: dto.label?.trim(), required: dto.required ?? true } });
    await this.log('tender-deliverable', row.id, 'technical-tender.deliverable-created', tender.organizationId, user, undefined, row);
    return row;
  }

  async removeDeliverable(tenderId: string, deliverableId: string, user: CurrentUserPayload) {
    const tender = await this.getTender(tenderId, user);
    this.assertTenderOpen(tender.status);
    const current = await this.prisma.tenderDeliverable.findFirst({ where: { id: deliverableId, tenderId, organizationId: tender.organizationId } });
    if (!current) throw new NotFoundException('Tender deliverable not found');
    await this.prisma.tenderDeliverable.delete({ where: { id: deliverableId } });
    await this.log('tender-deliverable', deliverableId, 'technical-tender.deliverable-deleted', tender.organizationId, user, current);
    return { id: deliverableId, deleted: true };
  }

  async getTenderReadiness(id: string, user: CurrentUserPayload) {
    const tender = await this.getTender(id, user);
    return tender.readiness;
  }

  async listTenderReviews(id: string, user: CurrentUserPayload) {
    const tender = await this.getTender(id, user);
    return tender.reviews;
  }

  async requestTenderReview(id: string, dto: RequestTenderReviewDto, user: CurrentUserPayload) {
    const tender = await this.getTender(id, user);
    this.assertTenderOpen(tender.status);
    const permission = dto.type === TenderReviewType.TECHNICAL ? 'technical-tender:review-technical' : 'technical-tender:review-commercial';
    this.require(user, permission);
    const expectedStatus = dto.type === TenderReviewType.TECHNICAL ? TenderStatus.TECHNICAL_REVIEW : TenderStatus.COMMERCIAL_REVIEW;
    if (tender.status !== expectedStatus) throw new BadRequestException({ code: 'REVIEW_NOT_AVAILABLE_IN_CURRENT_STATUS', message: `این بازبینی فقط در مرحله ${expectedStatus === TenderStatus.TECHNICAL_REVIEW ? 'بازبینی فنی' : 'بازبینی تجاری'} قابل درخواست است` });
    if (dto.reviewerId) await this.assertUser(tender.organizationId, dto.reviewerId);
    if (dto.revision !== undefined && dto.revision !== tender.revision) throw new ConflictException({ code: 'REVISION_CONFLICT', message: 'The tender was changed by another request' });
    const pending = tender.reviews.find((review) => review.type === dto.type && review.status === TenderReviewStatus.PENDING);
    if (pending) throw new ConflictException({ code: 'REVIEW_ALREADY_PENDING', message: 'برای این نوع بازبینی یک درخواست در انتظار وجود دارد' });
    let row;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const revision = await tx.tender.updateMany({ where: { id, organizationId: tender.organizationId, revision: tender.revision }, data: { revision: { increment: 1 }, updatedById: user.userId } });
        if (revision.count !== 1) throw new ConflictException({ code: 'REVISION_CONFLICT', message: 'The tender was changed by another request' });
        return tx.tenderReview.create({
          data: { organizationId: tender.organizationId, tenderId: id, type: dto.type, reviewerId: dto.reviewerId, requestedById: user.userId, comment: dto.comment?.trim() },
          include: { reviewer: true, requestedBy: true, decidedBy: true },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'REVIEW_ALREADY_PENDING', message: 'برای این نوع بازبینی یک درخواست در انتظار وجود دارد' });
      throw error;
    }
    await this.log('technical-tender', id, `technical-tender.review-${dto.type.toLowerCase()}-requested`, tender.organizationId, user, undefined, row, dto.comment);
    if (row.reviewerId) await this.notifyTender(row.reviewerId, user, id, dto.type === TenderReviewType.TECHNICAL ? 'بازبینی فنی جدید' : 'بازبینی تجاری جدید', tender.title);
    return row;
  }

  async decideTenderReview(id: string, reviewId: string, dto: DecideTenderReviewDto, user: CurrentUserPayload) {
    const tender = await this.getTender(id, user);
    this.assertTenderOpen(tender.status);
    const review = await this.prisma.tenderReview.findFirst({ where: { id: reviewId, tenderId: id, organizationId: tender.organizationId } });
    if (!review) throw new NotFoundException('Tender review not found');
    const permission = review.type === TenderReviewType.TECHNICAL ? 'technical-tender:review-technical' : 'technical-tender:review-commercial';
    this.require(user, permission);
    if (review.status !== TenderReviewStatus.PENDING) throw new ConflictException({ code: 'REVIEW_ALREADY_DECIDED', message: 'نتیجه این بازبینی قبلاً ثبت شده است' });
    if (dto.status !== TenderReviewStatus.APPROVED && dto.status !== TenderReviewStatus.REJECTED && dto.status !== TenderReviewStatus.CANCELLED) {
      throw new BadRequestException({ code: 'INVALID_REVIEW_DECISION', message: 'نتیجه بازبینی باید تأیید، رد یا لغو باشد' });
    }
    if (dto.status === TenderReviewStatus.REJECTED && !dto.comment?.trim()) throw new BadRequestException({ code: 'REVIEW_REJECTION_REASON_REQUIRED', message: 'برای رد بازبینی باید دلیل را ثبت کنید' });
    if (dto.revision !== undefined && dto.revision !== tender.revision) throw new ConflictException({ code: 'REVISION_CONFLICT', message: 'The tender was changed by another request' });
    const row = await this.prisma.$transaction(async (tx) => {
      const revision = await tx.tender.updateMany({ where: { id, organizationId: tender.organizationId, revision: tender.revision }, data: { revision: { increment: 1 }, updatedById: user.userId } });
      if (revision.count !== 1) throw new ConflictException({ code: 'REVISION_CONFLICT', message: 'The tender was changed by another request' });
      const decision = await tx.tenderReview.updateMany({ where: { id: reviewId, tenderId: id, organizationId: tender.organizationId, status: TenderReviewStatus.PENDING }, data: { status: dto.status, decidedById: user.userId, reviewedAt: new Date(), comment: dto.comment?.trim() } });
      if (decision.count !== 1) throw new ConflictException({ code: 'REVIEW_ALREADY_DECIDED', message: 'نتیجه این بازبینی قبلاً ثبت شده است' });
      return tx.tenderReview.findUniqueOrThrow({ where: { id: reviewId } });
    });
    await this.log('technical-tender', id, `technical-tender.review-${review.type.toLowerCase()}-${dto.status.toLowerCase()}`, tender.organizationId, user, review, row, dto.comment);
    if (dto.status === TenderReviewStatus.REJECTED) await this.notifyTender(tender.ownerId, user, id, 'بازبینی مناقصه رد شد', dto.comment || tender.title, NotificationPriority.HIGH);
    return row;
  }

  async tenderHistory(id: string, user: CurrentUserPayload) {
    const tender = await this.getTender(id, user);
    return this.prisma.auditLog.findMany({
      where: { organizationId: tender.organizationId, entityType: 'technical-tender', entityId: id },
      orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, action: true, before: true, after: true, metadata: true, actorId: true, createdAt: true },
    });
  }

  private evaluateReadiness(tender: any) {
    const now = new Date();
    const requirements = tender.requirements ?? [];
    const mandatory = requirements.filter((row: any) => row.mandatory);
    const mandatoryVerified = mandatory.filter((row: any) => row.status === TenderRequirementStatus.VERIFIED);
    const unresolved = mandatory.filter((row: any) => row.status !== TenderRequirementStatus.VERIFIED);
    const blocked = requirements.filter((row: any) => row.status === TenderRequirementStatus.BLOCKED);
    const overdue = requirements.filter((row: any) => row.status !== TenderRequirementStatus.VERIFIED && row.dueDate && new Date(row.dueDate) < now);
    const unassigned = requirements.filter((row: any) => row.status !== TenderRequirementStatus.VERIFIED && !row.ownerId);
    const withoutTask = requirements.filter((row: any) => !row.taskId);
    const dependencyBlocked = requirements.filter((row: any) => row.dependencies?.some((dependency: any) => ![TenderRequirementStatus.VERIFIED, TenderRequirementStatus.NOT_APPLICABLE].includes(dependency.dependsOnRequirement?.status)));
    const criticalUnsatisfied = requirements.filter((row: any) => row.mandatory && ![TenderRequirementStatus.VERIFIED, TenderRequirementStatus.NOT_APPLICABLE].includes(row.status));
    const dueAfterSubmission = tender.submissionDeadline
      ? requirements.filter((row: any) => row.dueDate && new Date(row.dueDate) > new Date(tender.submissionDeadline))
      : [];
    const deliverables = tender.deliverables ?? [];
    const requiredDeliverables = deliverables.filter((row: any) => row.required !== false);
    const completedDeliverables = requiredDeliverables.filter((row: any) =>
      ['APPROVED', 'ACTIVE'].includes(row.document?.status) && Boolean(row.document?.versions?.some((version: any) => version.attachmentId)),
    );
    const latest = (type: TenderReviewType) => (tender.reviews ?? []).find((row: any) => row.type === type);
    const technicalReview = latest(TenderReviewType.TECHNICAL);
    const commercialReview = latest(TenderReviewType.COMMERCIAL);
    const requiredFields = ['title', 'ownerId', 'tenderType', 'companyId', 'submissionDeadline'];
    const missingFields = requiredFields.filter((field) => !tender[field]);
    const deadlinePassed = Boolean(tender.submissionDeadline && new Date(tender.submissionDeadline) < now && !tender.submittedAt);
    const blockers: Array<{ code: string; count?: number; fields?: string[] }> = [];
    const warnings: Array<{ code: string; count?: number }> = [];
    if (unresolved.length) blockers.push({ code: 'MANDATORY_REQUIREMENTS_INCOMPLETE', count: unresolved.length });
    if (mandatory.some((row: any) => row.status !== TenderRequirementStatus.VERIFIED && !row.ownerId)) blockers.push({ code: 'MANDATORY_REQUIREMENTS_UNASSIGNED', count: mandatory.filter((row: any) => row.status !== TenderRequirementStatus.VERIFIED && !row.ownerId).length });
    if (completedDeliverables.length !== requiredDeliverables.length) blockers.push({ code: 'REQUIRED_DELIVERABLES_INCOMPLETE', count: requiredDeliverables.length - completedDeliverables.length });
    if (tender.bidDecision !== TenderBidDecision.BID) blockers.push({ code: 'TENDER_BID_DECISION_REQUIRED' });
    if (!([TenderQualificationDecision.GO, TenderQualificationDecision.CONDITIONAL_GO] as TenderQualificationDecision[]).includes(tender.qualificationDecision)) blockers.push({ code: 'TENDER_QUALIFICATION_APPROVAL_REQUIRED' });
    if (technicalReview?.status !== TenderReviewStatus.APPROVED) blockers.push({ code: 'TECHNICAL_REVIEW_NOT_APPROVED' });
    if (commercialReview?.status !== TenderReviewStatus.APPROVED) blockers.push({ code: 'COMMERCIAL_REVIEW_NOT_APPROVED' });
    if (missingFields.length) blockers.push({ code: 'REQUIRED_TENDER_FIELDS_INCOMPLETE', fields: missingFields });
    if (deadlinePassed) blockers.push({ code: 'TENDER_DEADLINE_PASSED' });
    if (dueAfterSubmission.length) warnings.push({ code: 'REQUIREMENT_DUE_AFTER_SUBMISSION', count: dueAfterSubmission.length });
    if (overdue.length) warnings.push({ code: 'REQUIREMENTS_OVERDUE', count: overdue.length });
    if (dependencyBlocked.length) warnings.push({ code: 'REQUIREMENT_DEPENDENCIES_UNRESOLVED', count: dependencyBlocked.length });
    if (tender.qualificationDecision === TenderQualificationDecision.GO && criticalUnsatisfied.length) warnings.push({ code: 'GO_WITH_UNSATISFIED_REQUIREMENTS', count: criticalUnsatisfied.length });
    return {
      overallReady: blockers.length === 0,
      blockers,
      warnings,
      qualification: {
        bidDecision: tender.bidDecision,
        qualificationDecision: tender.qualificationDecision,
        fitScore: tender.fitScore,
        riskScore: tender.riskScore,
        feasibilityScore: tender.feasibilityScore,
        qualificationConditions: tender.qualificationConditions,
        decisionReason: tender.decisionReason,
        qualificationSummary: tender.qualificationSummary,
      },
      requirementSummary: {
        totalRequirements: requirements.length,
        satisfiedRequirements: requirements.filter((row: any) => row.status === TenderRequirementStatus.VERIFIED).length,
        openRequirements: requirements.filter((row: any) => [TenderRequirementStatus.OPEN, TenderRequirementStatus.IN_PROGRESS, TenderRequirementStatus.READY].includes(row.status)).length,
        blockedRequirements: blocked.length,
        criticalUnsatisfiedRequirements: criticalUnsatisfied.length,
        requirementsWithoutOwner: requirements.filter((row: any) => !row.ownerId).length,
        requirementsWithoutTask: withoutTask.length,
        dependencyBlockedRequirements: dependencyBlocked.length,
      },
      checks: {
        mandatoryRequirements: { total: mandatory.length, satisfied: mandatoryVerified.length, unresolved: unresolved.length, blocked: mandatory.filter((row: any) => row.status === TenderRequirementStatus.BLOCKED).length },
        requirements: { total: requirements.length, verified: requirements.filter((row: any) => row.status === TenderRequirementStatus.VERIFIED).length, inProgress: requirements.filter((row: any) => row.status === TenderRequirementStatus.IN_PROGRESS).length, open: requirements.filter((row: any) => row.status === TenderRequirementStatus.OPEN).length, blocked: blocked.length, overdue: overdue.length, unassigned: unassigned.length },
        deliverables: { total: deliverables.length, required: requiredDeliverables.length, completedRequired: completedDeliverables.length, missing: requiredDeliverables.length - completedDeliverables.length },
        technicalReview: { status: technicalReview?.status ?? 'NOT_STARTED', reviewId: technicalReview?.id ?? null },
        commercialReview: { status: commercialReview?.status ?? 'NOT_STARTED', reviewId: commercialReview?.id ?? null },
        submissionDeadline: { value: tender.submissionDeadline ?? null, overdue: deadlinePassed },
        requiredTenderFields: { complete: missingFields.length === 0, missing: missingFields },
      },
    };
  }

  private isReopen(from: TenderStatus, to: TenderStatus) {
    return (from === TenderStatus.TECHNICAL_REVIEW && to === TenderStatus.PREPARING)
      || (from === TenderStatus.COMMERCIAL_REVIEW && to === TenderStatus.TECHNICAL_REVIEW)
      || (from === TenderStatus.READY_FOR_SUBMISSION && to === TenderStatus.COMMERCIAL_REVIEW);
  }

  private async getRequirement(tenderId: string, requirementId: string, organizationId: string) {
    const row = await this.prisma.tenderRequirement.findFirst({ where: { id: requirementId, tenderId, organizationId } });
    if (!row) throw new NotFoundException('Tender requirement not found');
    return row;
  }

  private async assertRequirementIds(tenderId: string, ids: string[], organizationId: string) {
    const unique = [...new Set(ids)];
    const count = await this.prisma.tenderRequirement.count({ where: { id: { in: unique }, tenderId, organizationId } });
    if (count !== unique.length) throw new BadRequestException({ code: 'REQUIREMENT_TENDER_MISMATCH', message: 'All requirements must belong to the same tender' });
  }

  private async assertRequirementParent(tenderId: string, requirementId: string | undefined, parentId: string, organizationId: string) {
    if (requirementId && requirementId === parentId) throw new BadRequestException({ code: 'REQUIREMENT_SELF_PARENT', message: 'A requirement cannot be its own parent' });
    await this.assertRequirementIds(tenderId, [parentId], organizationId);
    if (!requirementId) return;
    const requirements = await this.prisma.tenderRequirement.findMany({ where: { tenderId, organizationId }, select: { id: true, parentRequirementId: true } });
    const parents = new Map(requirements.map((row) => [row.id, row.parentRequirementId]));
    let cursor: string | null | undefined = parentId;
    while (cursor) {
      if (cursor === requirementId) throw new BadRequestException({ code: 'REQUIREMENT_PARENT_CYCLE', message: 'Requirement hierarchy cannot contain a cycle' });
      cursor = parents.get(cursor);
    }
  }

  private async assertNoDependencyCycle(tenderId: string, requirementId: string, dependencyId: string, organizationId: string) {
    if (requirementId === dependencyId) throw new BadRequestException({ code: 'REQUIREMENT_SELF_DEPENDENCY', message: 'A requirement cannot depend on itself' });
    const rows = await this.prisma.tenderRequirementDependency.findMany({
      where: { requirement: { tenderId, organizationId } },
      select: { requirementId: true, dependsOnRequirementId: true },
    });
    const graph = new Map<string, string[]>();
    for (const row of rows) graph.set(row.requirementId, [...(graph.get(row.requirementId) ?? []), row.dependsOnRequirementId]);
    const seen = new Set<string>();
    const stack = [dependencyId];
    while (stack.length) {
      const current = stack.pop()!;
      if (current === requirementId) throw new BadRequestException({ code: 'REQUIREMENT_DEPENDENCY_CYCLE', message: 'Requirement dependencies cannot contain a cycle' });
      if (seen.has(current)) continue;
      seen.add(current);
      stack.push(...(graph.get(current) ?? []));
    }
  }

  private async notifyTender(recipientId: string, user: CurrentUserPayload, tenderId: string, title: string, body: string, priority: NotificationPriority = NotificationPriority.NORMAL) {
    await this.notifications?.notifyUser({ recipientId, actorId: user.userId, organizationId: getCurrentOrganizationId(user), type: NotificationType.TENDER_WORKFLOW, priority, title, body, entityType: NotificationEntityType.TENDER, entityId: tenderId, actionUrl: `/technical/tenders/${tenderId}`, skipSelf: true });
  }

  private async validateLinks<T extends object>(organizationId: string, input: T) {
    const dto = input as Record<string, unknown>;
    if (typeof dto.productId === 'string') await this.assertProduct(dto.productId);
    if (typeof dto.releaseId === 'string') {
      const release = await this.prisma.technicalRelease.findFirst({ where: { id: dto.releaseId, organizationId, archivedAt: null } });
      if (!release) throw new NotFoundException('Technical release not found');
      if (dto.productId && release.productId !== dto.productId) throw new BadRequestException('Release does not belong to the selected product');
    }
    if (typeof dto.companyId === 'string') await this.assertScoped('company', organizationId, dto.companyId);
    if (typeof dto.opportunityId === 'string') await this.assertScoped('opportunity', organizationId, dto.opportunityId);
    if (typeof dto.teamId === 'string') await this.assertScoped('team', organizationId, dto.teamId);
    for (const key of ['ownerId', 'reviewerId', 'technicalLeadId', 'commercialLeadId']) {
      if (typeof dto[key] === 'string') await this.assertUser(organizationId, dto[key] as string);
    }
    if (typeof dto.tenderId === 'string') await this.assertScoped('tender', organizationId, dto.tenderId);
  }

  private async assertProduct(id: string) {
    if (!await this.prisma.productCatalogItem.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Product not found');
  }

  private async assertReleaseVersionAvailable(organizationId: string, productId: string, version: string, excludeId?: string) {
    const duplicate = await this.prisma.technicalRelease.findFirst({
      where: { organizationId, productId, version: version.trim(), ...(excludeId && { id: { not: excludeId } }) },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException({
      code: 'DUPLICATE_RELEASE_VERSION',
      message: 'این شماره نسخه قبلاً برای محصول انتخاب‌شده ثبت شده است.',
    });
  }

  private async assertKnowledgeSlugAvailable(organizationId: string, slug: string, excludeId?: string) {
    const normalized = slug.trim().toLowerCase();
    const duplicate = await this.prisma.knowledgeBaseArticle.findFirst({
      where: {
        organizationId,
        slug: normalized,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException({
      code: 'DUPLICATE_KNOWLEDGE_SLUG',
      message: 'این نامک قبلاً برای مقاله دیگری استفاده شده است.',
    });
  }

  private async withResourceArtifactCounts<T extends { id: string }>(rows: T[], organizationId: string) {
    if (!rows.length) return rows.map((row) => ({ ...row, artifactCount: 0 }));
    const counts = await this.prisma.fileAttachment.groupBy({
      by: ['entityId'],
      where: {
        organizationId,
        entityType: FileAttachmentEntityType.TECHNICAL_RESOURCE,
        entityId: { in: rows.map((row) => row.id) },
        deletedAt: null,
      },
      _count: { _all: true },
    });
    const byId = new Map(counts.map((entry) => [entry.entityId, entry._count._all]));
    return rows.map((row) => ({ ...row, artifactCount: byId.get(row.id) ?? 0 }));
  }

  private assertResourceSource(resourceType: TechnicalResourceType, url?: string | null) {
    if (resourceType === TechnicalResourceType.EXTERNAL_LINK && !url?.trim()) {
      throw new BadRequestException({
        code: 'TECHNICAL_RESOURCE_URL_REQUIRED',
        message: 'برای منبع از نوع پیوند خارجی، ثبت URL الزامی است.',
      });
    }
  }

  private normalizeKnowledgeContent(
    dto: Pick<CreateKnowledgeDto, 'contentType' | 'content' | 'externalUrl'>,
    current?: { contentType: KnowledgeContentType; content: string | null; externalUrl: string | null },
  ) {
    const contentType = dto.contentType ?? current?.contentType ?? KnowledgeContentType.ARTICLE;
    const content = dto.content === undefined ? current?.content ?? null : this.nullableTrim(dto.content);
    const externalUrl = dto.externalUrl === undefined ? current?.externalUrl ?? null : this.nullableTrim(dto.externalUrl);
    if (contentType === KnowledgeContentType.ARTICLE && !content) {
      throw new BadRequestException({ code: 'KNOWLEDGE_CONTENT_REQUIRED', message: 'برای محتوای داخلی، متن مقاله الزامی است.' });
    }
    if (contentType === KnowledgeContentType.EXTERNAL_LINK && !externalUrl) {
      throw new BadRequestException({ code: 'KNOWLEDGE_EXTERNAL_URL_REQUIRED', message: 'برای محتوای لینک‌شده، آدرس منبع الزامی است.' });
    }
    return {
      contentType,
      content: contentType === KnowledgeContentType.ARTICLE ? content : null,
      externalUrl: contentType === KnowledgeContentType.EXTERNAL_LINK ? externalUrl : null,
    };
  }

  private releaseSchedule(
    dto: Pick<CreateReleaseDto, 'releaseDate' | 'supportStartDate' | 'supportEndDate' | 'endOfLifeDate'>,
    current?: { releaseDate: Date | null; supportStartDate: Date | null; supportEndDate: Date | null; endOfLifeDate: Date | null },
  ) {
    const schedule = {
      releaseDate: dto.releaseDate !== undefined ? this.date(dto.releaseDate, 'releaseDate') : current?.releaseDate,
      supportStartDate: dto.supportStartDate !== undefined ? this.date(dto.supportStartDate, 'supportStartDate') : current?.supportStartDate,
      supportEndDate: dto.supportEndDate !== undefined ? this.date(dto.supportEndDate, 'supportEndDate') : current?.supportEndDate,
      endOfLifeDate: dto.endOfLifeDate !== undefined ? this.date(dto.endOfLifeDate, 'endOfLifeDate') : current?.endOfLifeDate,
    };
    const ordered = [schedule.releaseDate, schedule.supportStartDate, schedule.supportEndDate, schedule.endOfLifeDate]
      .filter((value): value is Date => Boolean(value));
    if (ordered.some((value, index) => {
      const previous = ordered[index - 1];
      return previous !== undefined && value.getTime() < previous.getTime();
    })) {
      throw new BadRequestException({
        code: 'RELEASE_DATE_ORDER_INVALID',
        message: 'ترتیب تاریخ انتشار، شروع پشتیبانی، پایان پشتیبانی و پایان عمر معتبر نیست.',
      });
    }
    return schedule;
  }

  private async assertScoped(model: 'company' | 'opportunity' | 'team' | 'tender', organizationId: string, id: string) {
    const row = await (this.prisma[model] as any).findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!row) throw new NotFoundException(`${model} not found`);
  }

  private async assertUser(organizationId: string, userId: string) {
    const row = await this.prisma.organizationMembership.findFirst({ where: { organizationId, userId, status: 'ACTIVE' }, select: { id: true } });
    if (!row) throw new NotFoundException('Tenant user not found');
  }

  private async assertAttachment(organizationId: string, id: string, entityType: FileAttachmentEntityType, entityId: string) {
    const row = await this.prisma.fileAttachment.findFirst({ where: { id, organizationId, entityType, entityId, deletedAt: null }, select: { id: true } });
    if (!row) throw new BadRequestException('Attachment is not linked to this technical entity');
  }

  private async optimistic(model: 'technicalRelease' | 'technicalDocument' | 'tender', id: string, organizationId: string, revision: number, data: Record<string, unknown>) {
    const result = await (this.prisma[model] as any).updateMany({ where: { id, organizationId, revision }, data: { ...data, revision: { increment: 1 } } });
    if (result.count !== 1) throw new ConflictException({ code: 'REVISION_CONFLICT', message: 'The record was changed by another request' });
  }

  private require(user: CurrentUserPayload, permission: string) {
    if (!user.tenantContext?.permissions.includes(permission)) throw new ForbiddenException(`Permission required: ${permission}`);
  }

  private assertMutable(archivedAt: Date | null) {
    if (archivedAt) throw new BadRequestException('Archived records cannot be changed');
  }

  private assertTenderOpen(status: TenderStatus) {
    const closed: TenderStatus[] = [TenderStatus.WON, TenderStatus.LOST, TenderStatus.CANCELLED, TenderStatus.ARCHIVED];
    if (closed.includes(status)) throw new BadRequestException('Closed tenders cannot be changed');
  }

  private enumValue<T extends string>(values: Record<string, T>, value: string, field: string): T {
    if (!Object.values(values).includes(value as T)) throw new BadRequestException(`${field} is invalid`);
    return value as T;
  }

  private date(value: string | undefined, field: string) { return value === undefined ? undefined : parseApiDate(value, field); }
  private nullableDate(value: string | null | undefined, field: string) { return value === null ? null : this.date(value, field); }
  private nullableTrim(value: string | null | undefined) { return value === null ? null : value?.trim(); }
  private range(query: TechnicalListDto) { return parseApiDateRange(query.from, query.to, 'from', 'to'); }
  private skip(query: TechnicalListDto) { return ((query.page ?? 1) - 1) * (query.limit ?? 20); }
  private sort(query: TechnicalListDto, allowed: string[], fallback: string) {
    const field = query.sort ?? fallback;
    if (!allowed.includes(field)) throw new BadRequestException(`sort must be one of: ${allowed.join(', ')}`);
    return { [field]: query.sortDirection ?? 'desc' };
  }
  private async page<T>(query: TechnicalListDto, rows: () => Promise<T[]>, count: () => Promise<number>) {
    const [data, total] = await Promise.all([rows(), count()]);
    const page = query.page ?? 1, limit = query.limit ?? 20, totalPages = Math.ceil(total / limit);
    return { data, meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 } };
  }

  private log(entityType: string, entityId: string, action: string, organizationId: string, user: CurrentUserPayload, before?: unknown, after?: unknown, reason?: string) {
    return this.audit.recordTenantEvent({
      actorId: user.userId,
      actorMembershipId: user.membershipId,
      organizationId,
      entityType,
      entityId,
      action,
      before: this.auditSnapshot(before),
      after: this.auditSnapshot(after),
      metadata: reason ? { reason } : undefined,
    });
  }

  private auditSnapshot(value: unknown) {
    if (!value || typeof value !== 'object') return value;
    const row = value as Record<string, unknown>;
    const keys = ['id', 'organizationId', 'productId', 'releaseId', 'documentId', 'tenderId', 'companyId', 'opportunityId', 'ownerId', 'taskId', 'parentRequirementId', 'referenceId', 'dependencyIds', 'title', 'slug', 'version', 'status', 'resourceType', 'tenderType', 'result', 'bidDecision', 'qualificationDecision', 'fitScore', 'riskScore', 'feasibilityScore', 'fitNotes', 'riskNotes', 'feasibilityNotes', 'qualificationSummary', 'qualificationConditions', 'decisionReason', 'revision', 'archivedAt', 'updatedAt'];
    return Object.fromEntries(keys.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]));
  }
}
