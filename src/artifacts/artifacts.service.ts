import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ArtifactProvider,
  ArtifactRelationType,
  ArtifactType,
  Prisma,
} from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { getCurrentOrganizationId } from '../common/tenant/tenant-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateArtifactLinkDto,
  CreateExternalArtifactDto,
  FindArtifactsDto,
  UpdateArtifactDto,
  UploadArtifactDto,
} from './dto/artifact.dto';

const artifactInclude = {
  uploadedBy: { select: { id: true, fullName: true, email: true } },
  links: { orderBy: { createdAt: 'desc' as const } },
  _count: { select: { links: true } },
} satisfies Prisma.FileAttachmentInclude;

@Injectable()
export class ArtifactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: AttachmentsService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(query: FindArtifactsDto, user: CurrentUserPayload) {
    if (!query.entityType || !query.entityId)
      throw new BadRequestException('entityType and entityId are required');
    await this.attachments.assertEntityAccess(query.entityType, query.entityId, user);

    const page = query.page ?? 1, limit = query.limit ?? 20;
    const search = query.search?.trim();
    const where: Prisma.FileAttachmentWhereInput = {
      organizationId: getCurrentOrganizationId(user), deletedAt: null,
      type: query.type, provider: query.provider,
      ...(search && { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { originalFileName: { contains: search, mode: 'insensitive' } },
      ] }),
      ...(query.createdFrom || query.createdTo ? { createdAt: { gte: query.createdFrom ? new Date(query.createdFrom) : undefined, lte: query.createdTo ? new Date(query.createdTo) : undefined } } : {}),
      ...((query.entityType && query.entityId) || query.relationType ? { links: { some: {
        entityType: query.entityType, entityId: query.entityId, relationType: query.relationType,
      } } } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.fileAttachment.findMany({ where, include: artifactInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.fileAttachment.count({ where }),
    ]);
    return { data, meta: this.meta(total, page, limit) };
  }

  async findOne(id: string, user: CurrentUserPayload) {
    const artifact = await this.prisma.fileAttachment.findFirst({
      where: { id, organizationId: getCurrentOrganizationId(user), deletedAt: null }, include: artifactInclude,
    });
    if (!artifact) throw new NotFoundException('Artifact not found');
    if (artifact.links[0]) await this.attachments.assertEntityAccess(artifact.links[0].entityType, artifact.links[0].entityId, user);
    return artifact;
  }

  async upload(dto: UploadArtifactDto, file: Express.Multer.File | undefined, user: CurrentUserPayload) {
    const created = await this.attachments.upload(dto, file, user);
    if (dto.category || dto.tags || dto.versionLabel || dto.confidentiality) {
      await this.prisma.fileAttachment.update({ where: { id: created.id }, data: {
        category: dto.category?.trim(), tags: dto.tags?.map((tag) => tag.trim()).filter(Boolean),
        versionLabel: dto.versionLabel?.trim(), confidentiality: dto.confidentiality?.trim(),
      } });
    }
    await this.audit.record({
      actorId: user.userId, organizationId: getCurrentOrganizationId(user), entityType: 'artifact', entityId: created.id,
      action: 'artifact.uploaded', after: { id: created.id, name: created.name, type: ArtifactType.FILE, provider: created.provider, sha256: created.sha256 },
    });
    return this.findOne(created.id, user);
  }

  async createExternal(dto: CreateExternalArtifactDto, user: CurrentUserPayload) {
    if (dto.provider === ArtifactProvider.LOCAL || dto.provider === ArtifactProvider.OBJECT_STORAGE)
      throw new BadRequestException('External artifacts require an external provider');
    await this.attachments.assertEntityAccess(dto.entityType, dto.entityId, user, true);
    const externalUrl = this.normalizeExternalUrl(dto.externalUrl);
    const organizationId = getCurrentOrganizationId(user);
    const artifact = await this.prisma.$transaction(async (tx) => {
      const created = await tx.fileAttachment.create({ data: {
        organizationId, entityType: dto.entityType, entityId: dto.entityId,
        type: ArtifactType.EXTERNAL_URL, provider: dto.provider,
        name: this.requiredName(dto.name), externalUrl,
        description: dto.description?.trim(), metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        category: dto.category?.trim(), tags: dto.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
        versionLabel: dto.versionLabel?.trim(), confidentiality: dto.confidentiality?.trim(),
        storageProvider: 'LOCAL', uploadedById: user.userId,
      } });
      await tx.artifactLink.create({ data: {
        organizationId, artifactId: created.id, entityType: dto.entityType, entityId: dto.entityId,
        relationType: dto.relationType ?? ArtifactRelationType.REFERENCE, createdById: user.userId,
      } });
      return created;
    });
    await this.audit.record({
      actorId: user.userId, organizationId, entityType: 'artifact', entityId: artifact.id,
      action: 'artifact.external_created', after: { id: artifact.id, name: artifact.name, type: artifact.type, provider: artifact.provider, externalUrl },
    });
    return this.findOne(artifact.id, user);
  }

  async update(id: string, dto: UpdateArtifactDto, user: CurrentUserPayload) {
    const before = await this.findOne(id, user);
    if (before.links[0]) await this.attachments.assertEntityAccess(before.links[0].entityType, before.links[0].entityId, user, true);
    const updated = await this.prisma.fileAttachment.update({ where: { id }, data: {
      name: dto.name !== undefined ? this.requiredName(dto.name) : undefined,
      description: dto.description !== undefined ? dto.description.trim() || null : undefined,
      category: dto.category !== undefined ? dto.category.trim() || null : undefined,
      tags: dto.tags?.map((tag) => tag.trim()).filter(Boolean),
      versionLabel: dto.versionLabel !== undefined ? dto.versionLabel.trim() || null : undefined,
      confidentiality: dto.confidentiality !== undefined ? dto.confidentiality.trim() || null : undefined,
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
    }, include: artifactInclude });
    await this.audit.record({ actorId: user.userId, organizationId: before.organizationId, entityType: 'artifact', entityId: id, action: 'artifact.updated', before, after: updated });
    return updated;
  }

  async links(id: string, user: CurrentUserPayload) {
    await this.findOne(id, user);
    return this.prisma.artifactLink.findMany({ where: { artifactId: id, organizationId: getCurrentOrganizationId(user) }, orderBy: { createdAt: 'desc' } });
  }

  async link(id: string, dto: CreateArtifactLinkDto, user: CurrentUserPayload) {
    const artifact = await this.findOne(id, user);
    await this.attachments.assertEntityAccess(dto.entityType, dto.entityId, user, true);
    const relationType = dto.relationType ?? ArtifactRelationType.ATTACHMENT;
    try {
      const link = await this.prisma.artifactLink.create({ data: {
        organizationId: artifact.organizationId, artifactId: id, entityType: dto.entityType,
        entityId: dto.entityId, relationType, createdById: user.userId,
      } });
      await this.audit.record({ actorId: user.userId, organizationId: artifact.organizationId, entityType: 'artifact', entityId: id, action: 'artifact.linked', metadata: { entityType: dto.entityType, entityId: dto.entityId, relationType } });
      return link;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Artifact is already linked to this entity with the same relation');
      throw error;
    }
  }

  async unlink(id: string, linkId: string, user: CurrentUserPayload) {
    const artifact = await this.findOne(id, user);
    const link = await this.prisma.artifactLink.findFirst({ where: { id: linkId, artifactId: id, organizationId: artifact.organizationId } });
    if (!link) throw new NotFoundException('Artifact link not found');
    await this.attachments.assertEntityAccess(link.entityType, link.entityId, user, true);
    await this.prisma.artifactLink.delete({ where: { id: linkId } });
    await this.audit.record({ actorId: user.userId, organizationId: artifact.organizationId, entityType: 'artifact', entityId: id, action: 'artifact.unlinked', metadata: { entityType: link.entityType, entityId: link.entityId, relationType: link.relationType } });
    return { deleted: true };
  }

  async remove(id: string, user: CurrentUserPayload) {
    const artifact = await this.findOne(id, user);
    const deleted = await this.attachments.remove(id, user);
    await this.audit.record({ actorId: user.userId, organizationId: artifact.organizationId, entityType: 'artifact', entityId: id, action: 'artifact.deleted', before: { id, name: artifact.name, type: artifact.type, provider: artifact.provider } });
    return deleted;
  }

  private normalizeExternalUrl(value: string) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('Only HTTP/HTTPS artifact URLs are allowed');
    url.hash = '';
    return url.toString();
  }

  private requiredName(value: string) {
    const name = value.trim();
    if (!name) throw new BadRequestException('Artifact name is required');
    return name;
  }

  private meta(total: number, page: number, limit: number) {
    const totalPages = Math.ceil(total / limit);
    return { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 };
  }
}
