import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ArtifactProvider, ArtifactRelationType, ArtifactType, FileAttachmentEntityType, Prisma, UserRole } from '@prisma/client';
import { ArtifactsService } from '../src/artifacts/artifacts.service';
import { tenantUser } from './helpers/tenant-user';

const organizationId = '00000000-0000-4000-8000-000000000001';
const entityId = '00000000-0000-4000-8000-000000000010';
const artifactId = '00000000-0000-4000-8000-000000000020';
const user = tenantUser({ userId: 'user-1', email: 'admin@example.com', role: UserRole.ADMIN, organizationId });

function artifact(overrides: Record<string, unknown> = {}) {
  return { id: artifactId, organizationId, entityType: FileAttachmentEntityType.COMPANY, entityId,
    type: ArtifactType.EXTERNAL_URL, provider: ArtifactProvider.GITHUB, name: 'Repository', externalUrl: 'https://github.com/acme/crm',
    description: null, metadata: null, category: null, tags: [], versionLabel: null, confidentiality: null,
    originalFileName: null, mimeType: null, sizeBytes: null, sha256: null, deletedAt: null, uploadedById: user.userId,
    uploadedBy: { id: user.userId, fullName: 'Admin', email: user.email },
    links: [{ id: 'link-1', entityType: FileAttachmentEntityType.COMPANY, entityId, relationType: ArtifactRelationType.REFERENCE, createdAt: new Date() }],
    _count: { links: 1 }, createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

function setup() {
  const prisma: any = {
    fileAttachment: { create: jest.fn().mockResolvedValue(artifact()), findFirst: jest.fn().mockResolvedValue(artifact()), update: jest.fn().mockResolvedValue(artifact()), findMany: jest.fn(), count: jest.fn() },
    artifactLink: { create: jest.fn().mockResolvedValue({ id: 'link-1' }), findMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(artifact().links[0]), delete: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback(prisma));
  const attachments = { assertEntityAccess: jest.fn().mockResolvedValue(undefined), upload: jest.fn(), remove: jest.fn().mockResolvedValue({ deletedAt: new Date() }) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { prisma, attachments, audit, service: new ArtifactsService(prisma, attachments as any, audit as any) };
}

describe('ArtifactsService', () => {
  it('stores a normalized external provider reference without fetching it', async () => {
    const { service, prisma, audit } = setup();
    await service.createExternal({ name: ' Repository ', externalUrl: 'https://github.com/acme/crm#readme', provider: ArtifactProvider.GITHUB, entityType: FileAttachmentEntityType.COMPANY, entityId, relationType: ArtifactRelationType.REFERENCE, metadata: { repository: 'acme/crm', ref: 'main' } }, user);
    expect(prisma.fileAttachment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Repository', externalUrl: 'https://github.com/acme/crm', provider: ArtifactProvider.GITHUB, metadata: { repository: 'acme/crm', ref: 'main' } }) });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'artifact.external_created' }));
  });

  it('rejects non-http URLs and storage-only providers for external references', async () => {
    const { service } = setup();
    await expect(service.createExternal({ name: 'Unsafe', externalUrl: 'ftp://example.com/file', provider: ArtifactProvider.GENERIC_URL, entityType: FileAttachmentEntityType.COMPANY, entityId }, user)).rejects.toThrow(BadRequestException);
    await expect(service.createExternal({ name: 'Wrong', externalUrl: 'https://example.com', provider: ArtifactProvider.LOCAL, entityType: FileAttachmentEntityType.COMPANY, entityId }, user)).rejects.toThrow(BadRequestException);
  });

  it('rejects a link when entity access fails', async () => {
    const { service, attachments, prisma } = setup();
    attachments.assertEntityAccess.mockRejectedValueOnce(new NotFoundException('Company not found'));
    await expect(service.link(artifactId, { entityType: FileAttachmentEntityType.COMPANY, entityId }, user)).rejects.toThrow(NotFoundException);
    expect(prisma.artifactLink.create).not.toHaveBeenCalled();
  });

  it('maps the unique-link constraint to a conflict', async () => {
    const { service, prisma } = setup();
    prisma.artifactLink.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.22.0' }));
    await expect(service.link(artifactId, { entityType: FileAttachmentEntityType.COMPANY, entityId }, user)).rejects.toThrow(ConflictException);
  });

  it('unlinks only the selected relation and leaves the artifact intact', async () => {
    const { service, prisma } = setup();
    await service.unlink(artifactId, 'link-1', user);
    expect(prisma.artifactLink.delete).toHaveBeenCalledWith({ where: { id: 'link-1' } });
    expect(prisma.fileAttachment.update).not.toHaveBeenCalled();
  });

  it('soft-deletes through the backward-compatible attachment service', async () => {
    const { service, attachments, audit } = setup();
    await service.remove(artifactId, user);
    expect(attachments.remove).toHaveBeenCalledWith(artifactId, user);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'artifact.deleted' }));
  });
});
