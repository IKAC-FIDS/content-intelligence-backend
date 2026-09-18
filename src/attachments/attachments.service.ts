import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FileAttachment,
  FileAttachmentEntityType,
  ArtifactProvider,
  ArtifactRelationType,
  ArtifactType,
  MeetingStatus,
  Prisma,
  QuotaMetric,
  UserRole,
} from '@prisma/client';
import { getCurrentOrganizationId } from '../common/tenant/tenant-scope.util';
import { userTeamScopeWhere } from '../common/tenant/team-scope.util';
import { createHash, randomUUID } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { FindAttachmentsDto } from './dto/find-attachments.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';
import {
  ATTACHMENT_STORAGE,
  AttachmentStorageService,
} from './storage/attachment-storage.types';
import { QuotaService } from '../quota/quota.service';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
    @Inject(ATTACHMENT_STORAGE)
    private readonly storage: AttachmentStorageService,
    private readonly quota: QuotaService,
  ) {}

  async findAll(query: FindAttachmentsDto, user: CurrentUserPayload) {
    await this.assertEntityAccess(query.entityType, query.entityId, user);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.FileAttachmentWhereInput = {
      organizationId: getCurrentOrganizationId(user),
      entityType: query.entityType,
      entityId: query.entityId,
      deletedAt: null,
    };

    const [data, total] = await Promise.all([
      this.prisma.fileAttachment.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.fileAttachment.count({ where }),
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

  async findOne(id: string, user: CurrentUserPayload) {
    const attachment = await this.getActiveAttachment(id, user);

    await this.assertEntityAccess(
      attachment.entityType,
      attachment.entityId,
      user,
    );

    return attachment;
  }

  async upload(
    dto: UploadAttachmentDto,
    file: Express.Multer.File | undefined,
    user: CurrentUserPayload,
  ) {
    if (!file) {
      throw new BadRequestException('فایل الزامی است');
    }

    await this.assertEntityAccess(dto.entityType, dto.entityId, user, true);

    this.validateFile(file);

    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const originalFileName = this.sanitizeFileName(file.originalname);
    const extension = this.safeExtension(originalFileName);
    const storedFileName = `${randomUUID()}${extension}`;
    const relativeDirectory = join(year, month);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    const organizationId = getCurrentOrganizationId(user);
    const fileReservation = await this.quota.reserve(
      organizationId,
      QuotaMetric.FILES,
      1n,
      `attachment:file:${storedFileName}`,
      now,
      user.userId,
      user.tenantContext?.requestId,
    );
    let byteReservation;
    try {
      byteReservation = await this.quota.reserve(
        organizationId,
        QuotaMetric.STORAGE_BYTES,
        BigInt(file.size),
        `attachment:bytes:${storedFileName}`,
        now,
        user.userId,
        user.tenantContext?.requestId,
      );
    } catch (error) {
      await this.quota.releaseReservation(fileReservation.reservationId);
      throw error;
    }
    let stored: Awaited<ReturnType<AttachmentStorageService['save']>> | null =
      null;
    let attachment: FileAttachment | null = null;
    try {
      stored = await this.storage.save({
        buffer: file.buffer,
        storedFileName,
        relativeDirectory,
        mimeType: file.mimetype,
      });
      const saved = stored;

      attachment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.fileAttachment.create({ data: {
          organizationId,
          entityType: dto.entityType,
          entityId: dto.entityId,
          storageProvider: saved.storageProvider,
          bucket: saved.bucket,
          objectKey: saved.objectKey,
          storagePath: saved.storagePath,
          type: ArtifactType.FILE,
          provider: saved.storageProvider === 'MINIO' ? ArtifactProvider.OBJECT_STORAGE : ArtifactProvider.LOCAL,
          name: dto.name?.trim() || originalFileName,
          originalFileName,
          storedFileName,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          sha256,
          description: dto.description?.trim() || undefined,
          uploadedById: user.userId,
        } });
        await tx.artifactLink.create({ data: {
          organizationId, artifactId: created.id, entityType: dto.entityType,
          entityId: dto.entityId, relationType: dto.relationType ?? ArtifactRelationType.ATTACHMENT,
          createdById: user.userId,
        } });
        if (dto.entityType === FileAttachmentEntityType.TECHNICAL_RESOURCE) {
          await tx.technicalResource.update({
            where: { id: dto.entityId },
            data: { attachmentId: created.id, checksum: sha256 },
          });
        }
        return created;
      });
    } catch (error) {
      if (stored && !attachment)
        await this.storage.delete(
          stored.objectKey,
          stored.storagePath,
          stored.bucket,
        );
      await Promise.all([
        this.quota.releaseReservation(fileReservation.reservationId),
        this.quota.releaseReservation(byteReservation.reservationId),
      ]);
      throw error;
    }
    await this.quota.commitReservations([
      fileReservation.reservationId,
      byteReservation.reservationId,
    ]);

    await this.audit.record({
      actorId: user.userId,
      organizationId,
      entityType: 'file-attachment',
      entityId: attachment.id,
      action: 'attachment.uploaded',
      after: attachment,
      metadata: {
        attachedToEntityType: dto.entityType,
        attachedToEntityId: dto.entityId,
        originalFileName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageProvider: stored.storageProvider,
        bucket: stored.bucket,
        objectKey: stored.objectKey,
      },
    });

    return attachment;
  }

  async getDownloadStream(id: string, user: CurrentUserPayload) {
    const attachment = await this.getActiveAttachment(id, user);

    await this.assertEntityAccess(
      attachment.entityType,
      attachment.entityId,
      user,
    );

    if (!attachment.objectKey) {
      throw new BadRequestException(
        'Attachment does not have a stored file available for download',
      );
    }

    const stream = await this.storage.getStream(
      attachment.objectKey,
      attachment.storagePath,
      attachment.bucket,
    );

    await this.recordDownloadAudit(attachment, user);

    return {
      attachment,
      stream,
    };
  }

  async remove(id: string, user: CurrentUserPayload) {
    const attachment = await this.getActiveAttachment(id, user);

    await this.assertEntityAccess(
      attachment.entityType,
      attachment.entityId,
      user,
      true,
    );

    if (attachment.entityType === FileAttachmentEntityType.TECHNICAL_DOCUMENT) {
      const documentVersion = await this.prisma.technicalDocumentVersion.findFirst({
        where: { attachmentId: attachment.id },
        select: { id: true, version: true },
      });
      if (documentVersion) {
        throw new BadRequestException(
          `این فایل، فایل رسمی نسخه ${documentVersion.version} سند است و قابل حذف نیست.`,
        );
      }
    }

    const deleted = await this.prisma.fileAttachment.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: user.userId,
      },
    });
    await Promise.all([
      this.quota.synchronizeInventory(
        getCurrentOrganizationId(user),
        QuotaMetric.FILES,
      ),
      this.quota.synchronizeInventory(
        getCurrentOrganizationId(user),
        QuotaMetric.STORAGE_BYTES,
      ),
    ]);

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'file-attachment',
      entityId: attachment.id,
      action: 'attachment.deleted',
      before: attachment,
      after: deleted,
      metadata: {
        attachedToEntityType: attachment.entityType,
        attachedToEntityId: attachment.entityId,
        originalFileName: attachment.originalFileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        storageProvider: attachment.storageProvider,
        bucket: attachment.bucket,
        objectKey: attachment.objectKey,
      },
    });

    return deleted;
  }

  async getActiveAttachment(
    id: string,
    user: CurrentUserPayload,
  ): Promise<FileAttachment> {
    const attachment = await this.prisma.fileAttachment.findFirst({
      where: {
        id,
        organizationId: getCurrentOrganizationId(user),
        deletedAt: null,
      },
    });

    if (!attachment) {
      throw new NotFoundException('فایل پیوست پیدا نشد');
    }

    return attachment;
  }

  private validateFile(file: Express.Multer.File) {
    const maxSize = this.config.get<number>(
      'MAX_ATTACHMENT_SIZE_BYTES',
      26214400,
    );

    if (file.size > maxSize) {
      throw new BadRequestException(
        `حجم فایل بیشتر از حد مجاز است. حداکثر مجاز: ${maxSize} بایت`,
      );
    }

    const allowedMimeTypes = this.getAllowedMimeTypes();

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('نوع فایل مجاز نیست');
    }

    if (!file.buffer?.length) {
      throw new BadRequestException('فایل خالی است');
    }
  }

  private async recordDownloadAudit(
    attachment: FileAttachment,
    user: CurrentUserPayload,
  ) {
    await this.audit.record({
        actorId: user.userId,
        actorMembershipId: user.membershipId,
        organizationId: getCurrentOrganizationId(user),
        entityType: 'file-attachment',
        entityId: attachment.id,
        action: 'attachment.downloaded',
        metadata: {
          attachedToEntityType: attachment.entityType,
          attachedToEntityId: attachment.entityId,
          originalFileName: attachment.originalFileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          storageProvider: attachment.storageProvider,
        },
      });
  }

  private getAllowedMimeTypes() {
    return this.config
      .get<string>(
        'ALLOWED_ATTACHMENT_MIME_TYPES',
        [
          'application/pdf',
          'image/png',
          'image/jpeg',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/zip',
          'application/json',
          'application/xml',
          'text/xml',
          'text/markdown',
          'image/webp',
          'text/plain',
          'text/csv',
        ].join(','),
      )
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private sanitizeFileName(fileName: string) {
    const unsafeCharacters = new Set([
      '<',
      '>',
      ':',
      '"',
      '/',
      '\\',
      '|',
      '?',
      '*',
    ]);
    const cleanName = Array.from(basename(fileName))
      .map((char) =>
        unsafeCharacters.has(char) || char.charCodeAt(0) < 32 ? '_' : char,
      )
      .join('')
      .trim();

    return cleanName || 'attachment.bin';
  }

  private safeExtension(fileName: string) {
    const extension = extname(fileName).toLowerCase();

    if (!extension || extension.length > 20) {
      return '.bin';
    }

    return extension.replace(/[^a-z0-9.]/g, '') || '.bin';
  }

  async assertEntityAccess(
    entityType: FileAttachmentEntityType,
    entityId: string,
    user: CurrentUserPayload,
    mutation = false,
  ) {
    if (mutation && user.role === UserRole.BOARDS) {
      throw new ForbiddenException('Attachments are read-only for this role');
    }

    if (entityType === FileAttachmentEntityType.ORGANIZATION) {
      if (entityId !== getCurrentOrganizationId(user)) throw new NotFoundException('Organization not found');
      if (mutation && user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER)
        throw new ForbiddenException('Organization artifacts require manager access');
      return;
    }

    if (entityType === FileAttachmentEntityType.COMPANY) {
      const company = await this.prisma.company.findFirst({ where: {
        id: entityId, organizationId: getCurrentOrganizationId(user), archivedAt: null,
        ...(user.role === UserRole.ADMIN || user.role === UserRole.BOARDS ? {} : user.role === UserRole.MANAGER ? { owner: userTeamScopeWhere(user) } : { ownerId: user.userId }),
      }, select: { id: true } });
      if (!company) throw new NotFoundException('Company not found');
      return;
    }

    if (entityType === FileAttachmentEntityType.PERSON) {
      const person = await this.prisma.person.findFirst({ where: {
        id: entityId, company: {
          organizationId: getCurrentOrganizationId(user), archivedAt: null,
          ...(user.role === UserRole.ADMIN || user.role === UserRole.BOARDS ? {} : user.role === UserRole.MANAGER ? { owner: userTeamScopeWhere(user) } : { ownerId: user.userId }),
        },
      }, select: { id: true } });
      if (!person) throw new NotFoundException('Person not found');
      return;
    }

    if (entityType === FileAttachmentEntityType.TASK) {
      const task = await this.prisma.task.findFirst({ where: {
        id: entityId, organizationId: getCurrentOrganizationId(user),
        ...(user.role === UserRole.ADMIN || user.role === UserRole.BOARDS ? {} : {
          OR: [{ createdById: user.userId }, { assignedToId: user.userId }, ...(user.role === UserRole.MANAGER && user.teamId ? [{ teamId: user.teamId }] : [])],
        }),
      }, select: { id: true } });
      if (!task) throw new NotFoundException('Task not found');
      return;
    }

    if (entityType === FileAttachmentEntityType.ACTIVITY) {
      const activity = await this.prisma.activity.findFirst({ where: {
        id: entityId, company: { organizationId: getCurrentOrganizationId(user) },
        ...(user.role === UserRole.ADMIN || user.role === UserRole.BOARDS ? {} : { OR: [{ userId: user.userId }, { company: user.role === UserRole.MANAGER ? { owner: userTeamScopeWhere(user) } : { ownerId: user.userId } }] }),
      }, select: { id: true } });
      if (!activity) throw new NotFoundException('Activity not found');
      return;
    }

    if (entityType === FileAttachmentEntityType.PRODUCT) {
      const product = await this.prisma.productCatalogItem.findFirst({ where: { id: entityId, isActive: true }, select: { id: true } });
      if (!product) throw new NotFoundException('Product not found');
      return;
    }

    if (entityType === FileAttachmentEntityType.OPPORTUNITY) {
      const opportunity = await this.prisma.opportunity.findFirst({
        where: {
          AND: [
            { id: entityId },
            { organizationId: getCurrentOrganizationId(user) },
            this.opportunityScopeWhere(user),
          ],
        },
      });

      if (!opportunity) {
        throw new NotFoundException('Opportunity not found');
      }

      if (mutation && opportunity.archivedAt) {
        throw new BadRequestException(
          'Archived opportunities cannot be changed',
        );
      }

      return;
    }

    if (entityType === FileAttachmentEntityType.COMMERCIAL_DOCUMENT) {
      const document =
        await this.prisma.opportunityCommercialDocument.findFirst({
          where: {
            id: entityId,
            opportunity: {
              AND: [
                { organizationId: getCurrentOrganizationId(user) },
                this.opportunityScopeWhere(user),
              ],
            },
          },
          include: {
            opportunity: true,
          },
        });

      if (!document) {
        throw new NotFoundException('Commercial document not found');
      }

      if (mutation && document.opportunity.archivedAt) {
        throw new BadRequestException(
          'Archived opportunities cannot be changed',
        );
      }

      return;
    }

    if (entityType === FileAttachmentEntityType.PAYMENT) {
      const payment = await this.prisma.opportunityPayment.findFirst({
        where: {
          id: entityId,
          opportunity: {
            AND: [
              { organizationId: getCurrentOrganizationId(user) },
              this.opportunityScopeWhere(user),
            ],
          },
        },
        include: {
          opportunity: true,
        },
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      if (mutation && payment.opportunity.archivedAt) {
        throw new BadRequestException(
          'Archived opportunities cannot be changed',
        );
      }

      return;
    }

    if (entityType === FileAttachmentEntityType.COMPANY_LEGAL_DOCUMENT) {
      const document = await this.prisma.companyLegalDocument.findFirst({
        where: {
          id: entityId,
          company: {
            organizationId: getCurrentOrganizationId(user),
            archivedAt: null,
          },
        },
      });
      if (!document) {
        throw new NotFoundException('Company legal document not found');
      }
      return;
    }

    if (entityType === FileAttachmentEntityType.MEETING) {
      const meeting = await this.prisma.meeting.findFirst({
        where: {
          id: entityId,
          organizationId: getCurrentOrganizationId(user),
        },
        select: {
          status: true,
        },
      });

      if (!meeting) {
        throw new NotFoundException('Meeting not found');
      }

      if (mutation && meeting.status !== MeetingStatus.COMPLETED) {
        throw new BadRequestException(
          'بارگذاری مستندات فقط برای جلسات برگزارشده امکان‌پذیر است.',
        );
      }

      return;
    }

    if (entityType === FileAttachmentEntityType.TECHNICAL_DOCUMENT) {
      const document = await this.prisma.technicalDocument.findFirst({
        where: {
          id: entityId,
          organizationId: getCurrentOrganizationId(user),
          archivedAt: null,
        },
      });
      if (!document) throw new NotFoundException('Technical document not found');
      return;
    }

    if (entityType === FileAttachmentEntityType.TECHNICAL_RESOURCE) {
      const resource = await this.prisma.technicalResource.findFirst({
        where: {
          id: entityId,
          organizationId: getCurrentOrganizationId(user),
          archivedAt: null,
        },
      });
      if (!resource) throw new NotFoundException('Technical resource not found');
      return;
    }

    throw new BadRequestException('Unsupported attachment entity type');
  }

  private opportunityScopeWhere(
    user: CurrentUserPayload,
  ): Prisma.OpportunityWhereInput {
    if (user.role === UserRole.ADMIN || user.role === UserRole.BOARDS) {
      return {};
    }

    if (user.role === UserRole.MANAGER) {
      return user.teamId || user.team
        ? {
            company: {
              owner: userTeamScopeWhere(user),
            },
          }
        : {
            id: {
              in: [],
            },
          };
    }

    return {
      OR: [
        {
          ownerId: user.userId,
        },
        {
          company: {
            ownerId: user.userId,
          },
        },
      ],
    };
  }
}
