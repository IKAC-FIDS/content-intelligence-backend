import { BadRequestException } from '@nestjs/common';
import { ProfileMediaService } from '../src/profile-media/profile-media.service';

describe('ProfileMediaService', () => {
  const storage = { save: jest.fn(), delete: jest.fn(), getStream: jest.fn() };
  const service = new ProfileMediaService(storage);

  beforeEach(() => jest.clearAllMocks());

  it('rejects non-image uploads before storage', async () => {
    const file = { mimetype: 'application/pdf', size: 10, originalname: 'a.pdf', buffer: Buffer.from('x') } as Express.Multer.File;
    await expect(service.save('companies', 'company-id', file)).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('stores images below a scoped safe directory', async () => {
    storage.save.mockResolvedValue({ storageProvider: 'LOCAL', bucket: null, objectKey: 'key', storagePath: 'path' });
    const file = { mimetype: 'image/png', size: 10, originalname: '../logo.png', buffer: Buffer.from('x') } as Express.Multer.File;
    await service.save('companies', 'company-id', file);
    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ relativeDirectory: expect.stringContaining('companies') }));
  });
});
