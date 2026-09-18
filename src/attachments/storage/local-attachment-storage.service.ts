import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttachmentStorageProvider } from '@prisma/client';
import { createReadStream } from 'node:fs';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type {
  AttachmentStorageService,
  SaveAttachmentInput,
  SavedAttachmentObject,
} from './attachment-storage.types';

@Injectable()
export class LocalAttachmentStorageService implements AttachmentStorageService {
  constructor(private readonly config: ConfigService) {}

  async save(input: SaveAttachmentInput): Promise<SavedAttachmentObject> {
    const objectKey = join(input.relativeDirectory, input.storedFileName);
    const absoluteDirectory = this.resolveStoragePath(input.relativeDirectory);
    const absolutePath = this.resolveStoragePath(objectKey);

    await mkdir(absoluteDirectory, { recursive: true });
    await writeFile(absolutePath, input.buffer, { flag: 'wx' });

    return {
      storageProvider: AttachmentStorageProvider.LOCAL,
      bucket: null,
      objectKey,
      storagePath: objectKey,
    };
  }

  async getStream(objectKey: string) {
    const absolutePath = this.resolveStoragePath(objectKey);

    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException('فایل ذخیره‌شده روی دیسک پیدا نشد');
    }

    return createReadStream(absolutePath);
  }

  async delete(objectKey: string) {
    try {
      await unlink(this.resolveStoragePath(objectKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private getStorageRoot() {
    return resolve(
      process.cwd(),
      this.config.get<string>('ATTACHMENT_STORAGE_ROOT', 'storage/attachments'),
    );
  }

  private resolveStoragePath(storagePath: string) {
    const storageRoot = this.getStorageRoot();
    const absolutePath = resolve(storageRoot, storagePath);

    if (
      absolutePath !== storageRoot &&
      !absolutePath.startsWith(`${storageRoot}${sep}`)
    ) {
      throw new ForbiddenException('Invalid attachment storage path');
    }

    return absolutePath;
  }
}
