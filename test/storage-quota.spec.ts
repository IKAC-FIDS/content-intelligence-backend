import { FileAttachmentEntityType, QuotaMetric } from '@prisma/client';
import { AttachmentsService } from '../src/attachments/attachments.service';
import { tenantUser } from './helpers/tenant-user';
const user = tenantUser({
  userId: 'user-a',
  email: 'a@test',
  role: 'ADMIN',
  organizationId: 'org-a',
});
const file: any = {
  originalname: 'a.pdf',
  mimetype: 'application/pdf',
  size: 10,
  buffer: Buffer.from('1234567890'),
};
function setup(
  options: { storageFailure?: boolean; dbFailure?: boolean } = {},
) {
  const attachment = {
    id: 'file-a',
    organizationId: 'org-a',
    entityType: FileAttachmentEntityType.MEETING,
    entityId: 'meeting-a',
    storageProvider: 'MINIO',
    bucket: 'bucket',
    objectKey: 'key',
    storagePath: null,
    originalFileName: 'a.pdf',
    storedFileName: 'stored.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 10,
    sha256: 'hash',
    description: null,
    uploadedById: 'user-a',
    deletedAt: null,
    deletedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const prisma: any = {
    meeting: {
      findFirst: jest.fn().mockResolvedValue({ status: 'COMPLETED' }),
    },
    fileAttachment: {
      create: options.dbFailure
        ? jest.fn().mockRejectedValue(new Error('db failed'))
        : jest.fn().mockResolvedValue(attachment),
      findFirst: jest.fn().mockResolvedValue(attachment),
      update: jest
        .fn()
        .mockResolvedValue({ ...attachment, deletedAt: new Date() }),
    },
    artifactLink: { create: jest.fn().mockResolvedValue({ id: 'link-a' }) },
  };
  prisma.$transaction = jest.fn((callback) => callback(prisma));
  const storage: any = {
    save: options.storageFailure
      ? jest.fn().mockRejectedValue(new Error('storage failed'))
      : jest.fn().mockResolvedValue({
          storageProvider: 'MINIO',
          bucket: 'bucket',
          objectKey: 'key',
          storagePath: null,
        }),
    delete: jest.fn(),
    getStream: jest.fn(),
  };
  const quota: any = {
    reserve: jest
      .fn()
      .mockResolvedValueOnce({ reservationId: 'files-r' })
      .mockResolvedValueOnce({ reservationId: 'bytes-r' }),
    commitReservations: jest.fn(),
    releaseReservation: jest.fn(),
    synchronizeInventory: jest.fn(),
  };
  const audit: any = { record: jest.fn() };
  const config: any = {
    get: jest.fn((_key: string, fallback: unknown) => fallback),
  };
  return {
    prisma,
    storage,
    quota,
    service: new AttachmentsService(prisma, config, audit, storage, quota),
  };
}
describe('storage quota integration fix 000093', () => {
  it('reserves one file and exact incoming bytes before object write then commits', async () => {
    const { service, quota, storage } = setup();
    await service.upload(
      { entityType: FileAttachmentEntityType.MEETING, entityId: 'meeting-a' },
      file,
      user,
    );
    expect(quota.reserve).toHaveBeenNthCalledWith(
      1,
      'org-a',
      QuotaMetric.FILES,
      1n,
      expect.stringContaining('attachment:file:'),
      expect.any(Date),
      'user-a',
      undefined,
    );
    expect(quota.reserve).toHaveBeenNthCalledWith(
      2,
      'org-a',
      QuotaMetric.STORAGE_BYTES,
      10n,
      expect.stringContaining('attachment:bytes:'),
      expect.any(Date),
      'user-a',
      undefined,
    );
    expect(storage.save.mock.invocationCallOrder[0]).toBeGreaterThan(
      quota.reserve.mock.invocationCallOrder[1],
    );
    expect(quota.commitReservations).toHaveBeenCalledWith([
      'files-r',
      'bytes-r',
    ]);
  });
  it('releases both reservations when storage fails', async () => {
    const { service, quota } = setup({ storageFailure: true });
    await expect(
      service.upload(
        { entityType: FileAttachmentEntityType.MEETING, entityId: 'meeting-a' },
        file,
        user,
      ),
    ).rejects.toThrow('storage failed');
    expect(quota.releaseReservation).toHaveBeenCalledTimes(2);
  });
  it('removes a newly written object and releases reservations when DB write fails', async () => {
    const { service, quota, storage } = setup({ dbFailure: true });
    await expect(
      service.upload(
        { entityType: FileAttachmentEntityType.MEETING, entityId: 'meeting-a' },
        file,
        user,
      ),
    ).rejects.toThrow('db failed');
    expect(storage.delete).toHaveBeenCalledWith('key', null, 'bucket');
    expect(quota.releaseReservation).toHaveBeenCalledTimes(2);
  });
  it('soft deletion reconciles file count and bytes without deleting existing object', async () => {
    const { service, quota, storage } = setup();
    await service.remove('file-a', user);
    expect(quota.synchronizeInventory).toHaveBeenCalledWith(
      'org-a',
      QuotaMetric.FILES,
    );
    expect(quota.synchronizeInventory).toHaveBeenCalledWith(
      'org-a',
      QuotaMetric.STORAGE_BYTES,
    );
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
