import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommercialDocumentStatus,
  CommercialDocumentType,
  FileAttachmentEntityType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { userTeamScopeWhere } from '../common/tenant/team-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeCommercialDocumentStatusDto } from './dto/change-commercial-document-status.dto';
import { CreateCommercialDocumentDto } from './dto/create-commercial-document.dto';
import { FindCommercialDocumentsDto } from './dto/find-commercial-documents.dto';
import { UpdateCommercialDocumentDto } from './dto/update-commercial-document.dto';
import { UploadCommercialDocumentDto } from './dto/upload-commercial-document.dto';
import { parseApiDate } from '../common/dates/api-date.util';

const commercialDocumentInclude = {
  payments: {
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      dueDate: true,
      paidAt: true,
      method: true,
      referenceNumber: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  },
} satisfies Prisma.OpportunityCommercialDocumentInclude;

const allowedCommercialDocumentMimeTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

@Injectable()
export class OpportunityCommercialDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly attachments: AttachmentsService,
  ) {}

  async findAll(
    opportunityId: string,
    query: FindCommercialDocumentsDto,
    user: CurrentUserPayload,
  ) {
    await this.getOpportunityForView(opportunityId, user);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.OpportunityCommercialDocumentWhereInput = {
      opportunityId,
    };

    if (query.type) {
      where.type = query.type;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const search = query.search.trim();

      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { externalRef: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.opportunityCommercialDocument.findMany({
        where,
        include: commercialDocumentInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.opportunityCommercialDocument.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async findOne(
    opportunityId: string,
    documentId: string,
    user: CurrentUserPayload,
  ) {
    await this.getOpportunityForView(opportunityId, user);

    const document = await this.prisma.opportunityCommercialDocument.findFirst({
      where: {
        id: documentId,
        opportunityId,
      },
      include: commercialDocumentInclude,
    });

    if (!document) {
      throw new NotFoundException('سند تجاری پیدا نشد');
    }

    return document;
  }

  async create(
    opportunityId: string,
    dto: CreateCommercialDocumentDto,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.getOpportunityForMutation(opportunityId, user);

    const status = dto.status ?? CommercialDocumentStatus.DRAFT;
    const statusDates = this.buildStatusDates(status, dto);

    const document = await this.prisma.opportunityCommercialDocument.create({
      data: {
        opportunityId: opportunity.id,
        type: dto.type,
        status,
        number: dto.number?.trim() || undefined,
        version: dto.version ?? 1,
        title: dto.title.trim(),
        description: dto.description?.trim() || undefined,
        amount:
          dto.amount !== undefined
            ? new Prisma.Decimal(dto.amount)
            : opportunity.estimatedValue ?? undefined,
        currency: dto.currency?.trim().toUpperCase() || 'IRR',
        validUntil: dto.validUntil ? parseApiDate(dto.validUntil, 'validUntil') : undefined,
        issuedAt: dto.issuedAt ? parseApiDate(dto.issuedAt, 'issuedAt') : undefined,
        sentAt: statusDates.sentAt,
        acceptedAt: statusDates.acceptedAt,
        rejectedAt: statusDates.rejectedAt,
        signedAt: statusDates.signedAt,
        fileUrl: dto.fileUrl?.trim() || undefined,
        externalRef: dto.externalRef?.trim() || undefined,
        notes: dto.notes?.trim() || undefined,
        createdById: user.userId,
        updatedById: user.userId,
      },
      include: commercialDocumentInclude,
    });

    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity-commercial-document',
      entityId: document.id,
      action: 'opportunity.document_created',
      after: document,
      metadata: {
        opportunityId: opportunity.id,
        type: document.type,
      },
    });

    return document;
  }

  async createWithFile(
    opportunityId: string,
    dto: UploadCommercialDocumentDto,
    file: Express.Multer.File | undefined,
    user: CurrentUserPayload,
  ) {
    this.assertUploadFile(file);

    const createDto = this.normalizeUploadDto(dto);
    const document = await this.create(opportunityId, createDto, user);

    try {
      const fileAttachment = await this.attachments.upload(
        {
          entityType: FileAttachmentEntityType.COMMERCIAL_DOCUMENT,
          entityId: document.id,
          description: createDto.description,
        },
        file,
        user,
      );

      return {
        ...document,
        fileAttachment,
      };
    } catch (error) {
      await this.prisma.opportunityCommercialDocument.delete({
        where: { id: document.id },
      });

      throw error;
    }
  }

  async update(
    opportunityId: string,
    documentId: string,
    dto: UpdateCommercialDocumentDto,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.getOpportunityForMutation(opportunityId, user);

    const current = await this.prisma.opportunityCommercialDocument.findFirst({
      where: {
        id: documentId,
        opportunityId,
      },
      include: commercialDocumentInclude,
    });

    if (!current) {
      throw new NotFoundException('سند تجاری پیدا نشد');
    }

    const data: Prisma.OpportunityCommercialDocumentUpdateInput = {
      updatedById: user.userId,
    };

    if (dto.type !== undefined) data.type = dto.type;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.number !== undefined) data.number = dto.number?.trim() || null;
    if (dto.version !== undefined) data.version = dto.version;

    if (dto.title !== undefined) {
      const title = dto.title.trim();

      if (!title) {
        throw new BadRequestException('عنوان سند الزامی است');
      }

      data.title = title;
    }

    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }

    if (dto.amount !== undefined) {
      data.amount = new Prisma.Decimal(dto.amount);
    }

    if (dto.currency !== undefined) {
      data.currency = dto.currency.trim().toUpperCase() || 'IRR';
    }

    if (dto.validUntil !== undefined) {
      data.validUntil = dto.validUntil ? parseApiDate(dto.validUntil, 'validUntil') : null;
    }

    if (dto.issuedAt !== undefined) {
      data.issuedAt = dto.issuedAt ? parseApiDate(dto.issuedAt, 'issuedAt') : null;
    }

    if (dto.sentAt !== undefined) {
      data.sentAt = dto.sentAt ? parseApiDate(dto.sentAt, 'sentAt') : null;
    }

    if (dto.acceptedAt !== undefined) {
      data.acceptedAt = dto.acceptedAt ? parseApiDate(dto.acceptedAt, 'acceptedAt') : null;
    }

    if (dto.rejectedAt !== undefined) {
      data.rejectedAt = dto.rejectedAt ? parseApiDate(dto.rejectedAt, 'rejectedAt') : null;
    }

    if (dto.signedAt !== undefined) {
      data.signedAt = dto.signedAt ? parseApiDate(dto.signedAt, 'signedAt') : null;
    }

    if (dto.fileUrl !== undefined) {
      data.fileUrl = dto.fileUrl?.trim() || null;
    }

    if (dto.externalRef !== undefined) {
      data.externalRef = dto.externalRef?.trim() || null;
    }

    if (dto.notes !== undefined) {
      data.notes = dto.notes?.trim() || null;
    }

    const updated = await this.prisma.opportunityCommercialDocument.update({
      where: { id: documentId },
      data,
      include: commercialDocumentInclude,
    });

    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity-commercial-document',
      entityId: documentId,
      action: 'opportunity.document_updated',
      before: current,
      after: updated,
      metadata: {
        opportunityId: opportunity.id,
      },
    });

    return updated;
  }

  async changeStatus(
    opportunityId: string,
    documentId: string,
    dto: ChangeCommercialDocumentStatusDto,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.getOpportunityForMutation(opportunityId, user);

    const current = await this.prisma.opportunityCommercialDocument.findFirst({
      where: {
        id: documentId,
        opportunityId,
      },
      include: commercialDocumentInclude,
    });

    if (!current) {
      throw new NotFoundException('سند تجاری پیدا نشد');
    }

    const now = new Date();

    const data: Prisma.OpportunityCommercialDocumentUpdateInput = {
      status: dto.status,
      updatedById: user.userId,
      ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
    };

    if (dto.status === CommercialDocumentStatus.SENT) data.sentAt = now;
    if (dto.status === CommercialDocumentStatus.ACCEPTED) data.acceptedAt = now;
    if (dto.status === CommercialDocumentStatus.REJECTED) data.rejectedAt = now;
    if (dto.status === CommercialDocumentStatus.SIGNED) data.signedAt = now;

    const updated = await this.prisma.opportunityCommercialDocument.update({
      where: { id: documentId },
      data,
      include: commercialDocumentInclude,
    });

    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity-commercial-document',
      entityId: documentId,
      action: 'opportunity.document_status_changed',
      before: {
        status: current.status,
      },
      after: {
        status: updated.status,
      },
      metadata: {
        opportunityId: opportunity.id,
        notes: dto.notes,
      },
    });

    return updated;
  }

  async remove(
    opportunityId: string,
    documentId: string,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.getOpportunityForMutation(opportunityId, user);

    const current = await this.prisma.opportunityCommercialDocument.findFirst({
      where: {
        id: documentId,
        opportunityId,
      },
    });

    if (!current) {
      throw new NotFoundException('سند تجاری پیدا نشد');
    }

    const deleted = await this.prisma.opportunityCommercialDocument.delete({
      where: { id: documentId },
    });

    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity-commercial-document',
      entityId: documentId,
      action: 'opportunity.document_deleted',
      before: current,
      metadata: {
        opportunityId: opportunity.id,
      },
    });

    return deleted;
  }

  private buildStatusDates(
    status: CommercialDocumentStatus,
    dto: CreateCommercialDocumentDto,
  ) {
    const now = new Date();

    return {
      sentAt:
        dto.sentAt
          ? parseApiDate(dto.sentAt, 'sentAt')
          : status === CommercialDocumentStatus.SENT
            ? now
            : undefined,
      acceptedAt:
        dto.acceptedAt
          ? parseApiDate(dto.acceptedAt, 'acceptedAt')
          : status === CommercialDocumentStatus.ACCEPTED
            ? now
            : undefined,
      rejectedAt:
        dto.rejectedAt
          ? parseApiDate(dto.rejectedAt, 'rejectedAt')
          : status === CommercialDocumentStatus.REJECTED
            ? now
            : undefined,
      signedAt:
        dto.signedAt
          ? parseApiDate(dto.signedAt, 'signedAt')
          : status === CommercialDocumentStatus.SIGNED
            ? now
            : undefined,
    };
  }

  private assertUploadFile(
    file: Express.Multer.File | undefined,
  ): asserts file is Express.Multer.File {
    if (!file) {
      throw new BadRequestException('Document file is required.');
    }

    if (!allowedCommercialDocumentMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('Unsupported document file type.');
    }
  }

  private normalizeUploadDto(
    dto: UploadCommercialDocumentDto,
  ): CreateCommercialDocumentDto {
    const type = dto.type ?? dto.documentType;

    if (!type || !Object.values(CommercialDocumentType).includes(type)) {
      throw new BadRequestException('Invalid commercial document type.');
    }

    const title = (dto.title ?? dto.name)?.trim();

    if (!title) {
      throw new BadRequestException('Document title is required.');
    }

    return {
      type,
      status:
        dto.status ??
        (dto.isSigned === true ? CommercialDocumentStatus.SIGNED : undefined),
      number: dto.number,
      version: dto.version,
      title,
      description: dto.description,
      amount: dto.amount,
      currency: dto.currency,
      validUntil: dto.validUntil ?? dto.expiresAt ?? dto.dueDate,
      issuedAt: dto.issuedAt ?? dto.issueDate,
      sentAt: dto.sentAt,
      acceptedAt: dto.acceptedAt,
      rejectedAt: dto.rejectedAt,
      signedAt: dto.signedAt,
      fileUrl: dto.fileUrl ?? dto.externalUrl,
      externalRef: dto.externalRef,
      notes: dto.notes,
    };
  }

  private async getOpportunityForView(
    opportunityId: string,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: {
        AND: [
          { id: opportunityId },
          this.opportunityScopeWhere(user),
        ],
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    return opportunity;
  }

  private async getOpportunityForMutation(
    opportunityId: string,
    user: CurrentUserPayload,
  ) {
    if (user.role === UserRole.BOARDS) {
      throw new ForbiddenException('Opportunity is read-only for this role');
    }

    const opportunity = await this.getOpportunityForView(opportunityId, user);

    if (opportunity.archivedAt) {
      throw new BadRequestException('Archived opportunities cannot be changed');
    }

    return opportunity;
  }

  private opportunityScopeWhere(
    user: CurrentUserPayload,
  ): Prisma.OpportunityWhereInput {
    if (user.role === UserRole.ADMIN || user.role === UserRole.BOARDS) {
      return {};
    }

    if (user.role === UserRole.MANAGER) {
      return user.teamId || user.team
        ? { company: { owner: userTeamScopeWhere(user) } }
        : { id: { in: [] } };
    }

    return {
      OR: [
        { ownerId: user.userId },
        { company: { ownerId: user.userId } },
      ],
    };
  }
}
