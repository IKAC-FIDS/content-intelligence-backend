import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import {
  ATTACHMENT_STORAGE,
  AttachmentStorageService,
  SavedAttachmentObject,
} from '../attachments/storage/attachment-storage.types';

export const PROFILE_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
]);

export type StoredProfileMedia = SavedAttachmentObject & {
  mimeType: string;
  originalName: string;
};

@Injectable()
export class ProfileMediaService {
  constructor(
    @Inject(ATTACHMENT_STORAGE)
    private readonly storage: AttachmentStorageService,
  ) {}

  async save(
    scope: 'companies' | 'users',
    entityId: string,
    file?: Express.Multer.File,
  ): Promise<StoredProfileMedia> {
    if (!file) throw new BadRequestException('فایل تصویر الزامی است');
    const extension = ALLOWED_MEDIA_TYPES.get(file.mimetype);
    if (!extension) {
      throw new BadRequestException('فرمت تصویر باید PNG، JPG، JPEG یا WEBP باشد');
    }
    if (!file.size || file.size > PROFILE_MEDIA_MAX_BYTES) {
      throw new BadRequestException('حجم تصویر باید حداکثر ۵ مگابایت باشد');
    }

    const saved = await this.storage.save({
      buffer: file.buffer,
      storedFileName: `${randomUUID()}${extension}`,
      relativeDirectory: join('profile-media', scope, entityId),
      mimeType: file.mimetype,
    });
    return {
      ...saved,
      mimeType: file.mimetype,
      originalName: this.safeName(file.originalname, extension),
    };
  }

  getStream(media: {
    objectKey: string;
    storagePath?: string | null;
    bucket?: string | null;
  }) {
    return this.storage.getStream(media.objectKey, media.storagePath, media.bucket);
  }

  async delete(media: {
    objectKey?: string | null;
    storagePath?: string | null;
    bucket?: string | null;
  }) {
    if (!media.objectKey) return;
    await this.storage.delete(media.objectKey, media.storagePath, media.bucket);
  }

  private safeName(name: string, fallbackExtension: string) {
    const base = name.replace(/[\\/\0\r\n]/g, '_').trim();
    return base ? `${base.slice(0, 180)}${extname(base) ? '' : fallbackExtension}` : `image${fallbackExtension}`;
  }
}
