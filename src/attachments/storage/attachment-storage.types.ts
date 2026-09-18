import { AttachmentStorageProvider } from '@prisma/client';
import type { Readable } from 'node:stream';

export const ATTACHMENT_STORAGE = 'ATTACHMENT_STORAGE';

export interface SaveAttachmentInput {
  buffer: Buffer;
  storedFileName: string;
  relativeDirectory: string;
  mimeType: string;
}

export interface SavedAttachmentObject {
  storageProvider: AttachmentStorageProvider;
  bucket: string | null;
  objectKey: string;
  storagePath: string | null;
}

export interface AttachmentStorageService {
  save(input: SaveAttachmentInput): Promise<SavedAttachmentObject>;
  delete(
    objectKey: string,
    storagePath?: string | null,
    bucket?: string | null,
  ): Promise<void>;
  getStream(
    objectKey: string,
    storagePath?: string | null,
    bucket?: string | null,
  ): Promise<Readable>;
}
