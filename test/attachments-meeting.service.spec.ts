import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AttachmentStorageProvider,
  FileAttachmentEntityType,
  MeetingStatus,
  UserRole,
} from '@prisma/client';
import { Readable } from 'node:stream';
import { AttachmentsService } from '../src/attachments/attachments.service';
import { quotaMock } from './helpers/quota';
import { tenantUser } from './helpers/tenant-user';

const organizationId = '00000000-0000-4000-8000-000000000001';
const meetingId = '00000000-0000-4000-8000-000000000010';
const attachmentId = '00000000-0000-4000-8000-000000000020';
const user = tenantUser({
  userId: 'user-1',
  email: 'user@example.com',
  role: UserRole.ADMIN,
  organizationId,
});
const file = {
  originalname: 'minutes.pdf',
  mimetype: 'application/pdf',
  size: 7,
  buffer: Buffer.from('minutes'),
} as Express.Multer.File;
const attachment = {
  id: attachmentId,
  organizationId,
  entityType: FileAttachmentEntityType.MEETING,
  entityId: meetingId,
  storageProvider: AttachmentStorageProvider.LOCAL,
  bucket: null,
  objectKey: '2026/07/stored.pdf',
  storagePath: 'attachments/2026/07/stored.pdf',
  originalFileName: 'minutes.pdf',
  storedFileName: 'stored.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 7,
  sha256: 'hash',
  description: null,
  uploadedById: user.userId,
  deletedAt: null,
  deletedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function setup(meetingStatus: MeetingStatus | null = MeetingStatus.COMPLETED) {
  const prisma = {
    meeting: {
      findFirst: jest
        .fn()
        .mockResolvedValue(meetingStatus ? { status: meetingStatus } : null),
    },
    fileAttachment: {
      findMany: jest.fn().mockResolvedValue([attachment]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(attachment),
      create: jest.fn().mockResolvedValue(attachment),
      update: jest.fn().mockResolvedValue({
        ...attachment,
        deletedAt: new Date(),
        deletedById: user.userId,
      }),
    },
    opportunity: {
      findFirst: jest.fn().mockResolvedValue({ archivedAt: null }),
    },
    opportunityCommercialDocument: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ opportunity: { archivedAt: null } }),
    },
    opportunityPayment: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ opportunity: { archivedAt: null } }),
    },
    companyLegalDocument: {
      findFirst: jest.fn().mockResolvedValue({ id: 'legal-1' }),
    },
    technicalResource: {
      findFirst: jest.fn().mockResolvedValue({ id: 'resource-1' }),
      update: jest.fn().mockResolvedValue({ id: 'resource-1' }),
    },
    artifactLink: { create: jest.fn().mockResolvedValue({ id: 'link-1' }) },
  };
  Object.assign(prisma, { $transaction: jest.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma)) });
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const storage = {
    save: jest.fn().mockResolvedValue({
      storageProvider: AttachmentStorageProvider.LOCAL,
      bucket: null,
      objectKey: attachment.objectKey,
      storagePath: attachment.storagePath,
    }),
    getStream: jest.fn().mockResolvedValue(Readable.from('minutes')),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn((_key: string, fallback: unknown) => fallback),
  };
  return {
    prisma,
    audit,
    storage,
    service: new AttachmentsService(
      prisma as any,
      config as any,
      audit as any,
      storage as any,
      quotaMock() as any,
    ),
  };
}

describe('AttachmentsService meeting attachments', () => {
  it('stores the generated SHA-256 as technical resource metadata', async () => {
    const { service, prisma } = setup();

    await service.upload(
      {
        entityType: FileAttachmentEntityType.TECHNICAL_RESOURCE,
        entityId: 'resource-1',
      },
      file,
      user,
    );

    expect(prisma.technicalResource.update).toHaveBeenCalledWith({
      where: { id: 'resource-1' },
      data: {
        attachmentId,
        checksum:
          '90e63d85fa1ab2c8ed65222f3ebd794b1e524b4b7cf84bec451542d0451b2985',
      },
    });
  });

  it('accepts an upload for a completed meeting and audits meeting metadata', async () => {
    const { service, prisma, audit } = setup();

    await service.upload(
      { entityType: FileAttachmentEntityType.MEETING, entityId: meetingId },
      file,
      user,
    );

    expect(prisma.meeting.findFirst).toHaveBeenCalledWith({
      where: { id: meetingId, organizationId },
      select: { status: true },
    });
    expect(prisma.fileAttachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId,
        entityType: FileAttachmentEntityType.MEETING,
        entityId: meetingId,
        sha256: '90e63d85fa1ab2c8ed65222f3ebd794b1e524b4b7cf84bec451542d0451b2985',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attachment.uploaded',
        metadata: expect.objectContaining({
          attachedToEntityType: FileAttachmentEntityType.MEETING,
          attachedToEntityId: meetingId,
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storageProvider: AttachmentStorageProvider.LOCAL,
        }),
      }),
    );
  });

  it.each([MeetingStatus.SCHEDULED, MeetingStatus.CANCELLED])(
    'rejects upload for a %s meeting',
    async (status) => {
      const { service, storage } = setup(status);
      await expect(
        service.upload(
          { entityType: FileAttachmentEntityType.MEETING, entityId: meetingId },
          file,
          user,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(storage.save).not.toHaveBeenCalled();
    },
  );

  it('lists attachments with both organization and meeting scope', async () => {
    const { service, prisma } = setup();
    await service.findAll(
      { entityType: FileAttachmentEntityType.MEETING, entityId: meetingId },
      user,
    );
    expect(prisma.meeting.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: meetingId, organizationId } }),
    );
    expect(prisma.fileAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId, entityId: meetingId }),
      }),
    );
  });

  it('does not list another organization meeting or reveal its existence', async () => {
    const { service, prisma } = setup(null);
    await expect(
      service.findAll(
        { entityType: FileAttachmentEntityType.MEETING, entityId: meetingId },
        user,
      ),
    ).rejects.toThrow(new NotFoundException('Meeting not found'));
    expect(prisma.fileAttachment.findMany).not.toHaveBeenCalled();
  });

  it('does not download another organization meeting attachment', async () => {
    const { service, storage } = setup(null);
    await expect(service.getDownloadStream(attachmentId, user)).rejects.toThrow(
      new NotFoundException('Meeting not found'),
    );
    expect(storage.getStream).not.toHaveBeenCalled();
  });

  it('soft-deletes a completed meeting attachment and records complete metadata', async () => {
    const { service, prisma, audit } = setup();
    await service.remove(attachmentId, user);
    expect(prisma.fileAttachment.update).toHaveBeenCalledWith({
      where: { id: attachmentId },
      data: { deletedAt: expect.any(Date), deletedById: user.userId },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attachment.deleted',
        metadata: expect.objectContaining({
          attachedToEntityType: FileAttachmentEntityType.MEETING,
          attachedToEntityId: meetingId,
          originalFileName: attachment.originalFileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        }),
      }),
    );
  });

  it.each([MeetingStatus.SCHEDULED, MeetingStatus.CANCELLED])(
    'rejects deletion for a %s meeting',
    async (status) => {
      const { service, prisma } = setup(status);
      await expect(service.remove(attachmentId, user)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.fileAttachment.update).not.toHaveBeenCalled();
    },
  );

  it('allows BOARDS to list and download meeting attachments', async () => {
    const { service, storage } = setup();
    const boardsUser = { ...user, role: UserRole.BOARDS };
    await service.findAll(
      { entityType: FileAttachmentEntityType.MEETING, entityId: meetingId },
      boardsUser,
    );
    await service.getDownloadStream(attachmentId, boardsUser);
    expect(storage.getStream).toHaveBeenCalled();
  });

  it('prevents BOARDS from uploading or deleting meeting attachments', async () => {
    const { service, prisma } = setup();
    const boardsUser = { ...user, role: UserRole.BOARDS };
    await expect(
      service.upload(
        { entityType: FileAttachmentEntityType.MEETING, entityId: meetingId },
        file,
        boardsUser,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.remove(attachmentId, boardsUser)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.fileAttachment.update).not.toHaveBeenCalled();
  });

  it.each([
    FileAttachmentEntityType.OPPORTUNITY,
    FileAttachmentEntityType.COMMERCIAL_DOCUMENT,
    FileAttachmentEntityType.PAYMENT,
    FileAttachmentEntityType.COMPANY_LEGAL_DOCUMENT,
  ])('preserves access support for %s attachments', async (entityType) => {
    const { service } = setup();
    await expect(
      (service as any).assertEntityAccess(entityType, meetingId, user),
    ).resolves.toBeUndefined();
  });

  it('continues rejecting unsupported entity types', async () => {
    const { service } = setup();
    await expect(
      (service as any).assertEntityAccess('UNSUPPORTED', meetingId, user),
    ).rejects.toThrow(
      new BadRequestException('Unsupported attachment entity type'),
    );
  });
});
