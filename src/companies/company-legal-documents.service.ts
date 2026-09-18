import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FileAttachment,
  FileAttachmentEntityType,
  Prisma,
} from '@prisma/client';
import { AttachmentsService } from '../attachments/attachments.service';
import {
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import {
  parseApiDate,
  parseApiDateRange,
} from '../common/dates/api-date.util';
import { PaginationResponseDto } from '../common/pagination/pagination.response';
import {
  createPaginationMeta,
  getPaginationOffset,
} from '../common/pagination/pagination.util';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyAccessService } from './company-access.service';
import {
  UpdateCompanyLegalDocumentDto,
  UploadCompanyLegalDocumentDto,
} from './dto/company-legal-document.dto';
import { FindCompanyLegalDocumentsDto } from './dto/find-company-legal-documents.dto';

@Injectable()
export class CompanyLegalDocumentsService {
  private readonly logger = new Logger(CompanyLegalDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: AttachmentsService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  async findAll(
    companyId: string,
    query: FindCompanyLegalDocumentsDto,
    user: CurrentUserPayload,
  ) {
    await this.assertCompany(companyId, user);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { skip, take } = getPaginationOffset(page, limit);
    const search = query.search?.trim();
    const documentDate = parseApiDateRange(
      query.dateFrom,
      query.dateTo,
      'dateFrom',
      'dateTo',
    );

    const where: Prisma.CompanyLegalDocumentWhereInput = {
      companyId,
      ...(query.type ? { type: query.type } : {}),
      ...(documentDate ? { documentDate } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const direction = query.sortOrder ?? 'desc';
    const orderBy: Prisma.CompanyLegalDocumentOrderByWithRelationInput[] =
      query.sortBy === 'documentDate'
        ? [
            { documentDate: direction },
            { createdAt: direction },
            { id: direction },
          ]
        : [{ createdAt: direction }, { id: direction }];

    const [data, total] = await Promise.all([
      this.prisma.companyLegalDocument.findMany({
        where,
        orderBy,
        skip,
        take,
      }),
      this.prisma.companyLegalDocument.count({ where }),
    ]);

    return new PaginationResponseDto(
      data,
      createPaginationMeta(page, limit, total),
    );
  }

  async upload(
    companyId: string,
    dto: UploadCompanyLegalDocumentDto,
    file: Express.Multer.File | undefined,
    user: CurrentUserPayload,
    requestId: string | null = null,
  ) {
    await this.assertCompany(companyId, user);

    if (!file) {
      throw new BadRequestException('Legal document file is required');
    }

    const title = dto.title?.trim();
    if (!title) {
      throw new BadRequestException('Document title is required');
    }

    const document = await this.prisma.companyLegalDocument.create({
      data: {
        companyId,
        type: dto.type,
        title,
        description: dto.description?.trim() || undefined,
        documentDate: dto.documentDate
          ? parseApiDate(dto.documentDate, 'documentDate')
          : undefined,
        createdById: user.userId,
      },
    });

    let attachment: FileAttachment | undefined;

    try {
      attachment = await this.attachments.upload(
        {
          entityType: FileAttachmentEntityType.COMPANY_LEGAL_DOCUMENT,
          entityId: document.id,
          description: dto.description,
        },
        file,
        user,
      );

      const updated = await this.prisma.companyLegalDocument.update({
        where: { id: document.id },
        data: { attachmentId: attachment.id },
      });

      return {
        ...updated,
        attachment: {
          id: attachment.id,
          originalFileName: attachment.originalFileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          createdAt: attachment.createdAt,
        },
      };
    } catch (error) {
      this.logger.error(
        `Legal document upload failed companyId=${companyId} documentId=${document.id} requestId=${requestId ?? 'none'}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (attachment) {
        try {
          await this.attachments.remove(attachment.id, user);
        } catch (cleanupError) {
          this.logger.error(
            `Legal document attachment cleanup failed attachmentId=${attachment.id} requestId=${requestId ?? 'none'}`,
            cleanupError instanceof Error
              ? cleanupError.stack
              : String(cleanupError),
          );
        }
      }

      await this.prisma.companyLegalDocument.deleteMany({
        where: { id: document.id },
      });

      throw error;
    }
  }

  async update(
    companyId: string,
    documentId: string,
    dto: UpdateCompanyLegalDocumentDto,
    user: CurrentUserPayload,
  ) {
    await this.assertCompany(companyId, user);
    const current = await this.getDocument(companyId, documentId);

    const data: Prisma.CompanyLegalDocumentUpdateInput = {};

    if (dto.type !== undefined) data.type = dto.type;
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }
    if (dto.documentDate !== undefined) {
      data.documentDate = dto.documentDate
        ? parseApiDate(dto.documentDate, 'documentDate')
        : null;
    }

    if (dto.title !== undefined && !data.title) {
      throw new BadRequestException('Document title is required');
    }

    return this.prisma.companyLegalDocument.update({
      where: { id: current.id },
      data,
    });
  }

  async remove(
    companyId: string,
    documentId: string,
    user: CurrentUserPayload,
  ) {
    await this.assertCompany(companyId, user);
    const current = await this.getDocument(companyId, documentId);

    if (current.attachmentId) {
      await this.attachments.remove(current.attachmentId, user);
    }

    return this.prisma.companyLegalDocument.delete({
      where: { id: current.id },
    });
  }

  private async getDocument(companyId: string, id: string) {
    const document = await this.prisma.companyLegalDocument.findFirst({
      where: { id, companyId },
    });

    if (!document) {
      throw new NotFoundException('Company legal document not found');
    }

    return document;
  }

  private async assertCompany(
    companyId: string,
    user: CurrentUserPayload,
  ) {
    await this.companyAccess.assertCompanyMutable(companyId, user);
  }
}
