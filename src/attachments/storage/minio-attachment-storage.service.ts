import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttachmentStorageProvider } from '@prisma/client';
import {
  GetObjectCommand,
  DeleteObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { posix } from 'node:path';
import type {
  AttachmentStorageService,
  SaveAttachmentInput,
  SavedAttachmentObject,
} from './attachment-storage.types';

@Injectable()
export class MinioAttachmentStorageService implements AttachmentStorageService {
  private readonly logger = new Logger(MinioAttachmentStorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new BadRequestException(
        'MinIO/S3 storage requires S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY',
      );
    }

    this.bucket = this.config.get<string>('S3_BUCKET', 'iam-crm-attachments');

    this.client = new S3Client({
      endpoint,
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      forcePathStyle: this.config.get<boolean>('S3_FORCE_PATH_STYLE', true),
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async save(input: SaveAttachmentInput): Promise<SavedAttachmentObject> {
    const objectKey = posix.join(
      input.relativeDirectory.replace(/\\/g, '/'),
      input.storedFileName,
    );

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: input.buffer,
          ContentType: input.mimeType,
          Metadata: {
            originalStoredFileName: input.storedFileName,
          },
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to upload attachment object ${objectKey} to bucket ${this.bucket}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new ServiceUnavailableException({
        code: 'ATTACHMENT_STORAGE_UPLOAD_FAILED',
        message: 'Failed to upload attachment to object storage',
        details: this.normalizeStorageError(error),
      });
    }

    return {
      storageProvider: AttachmentStorageProvider.MINIO,
      bucket: this.bucket,
      objectKey,
      storagePath: null,
    };
  }

  async getStream(
    objectKey: string,
    _storagePath?: string | null,
    bucket?: string | null,
  ) {
    const resolvedBucket = bucket || this.bucket;

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: resolvedBucket,
          Key: objectKey,
        }),
      );

      if (!response.Body) {
        throw new NotFoundException('File was not found in object storage');
      }

      return response.Body as Readable;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof NoSuchKey || this.isObjectNotFoundError(error)) {
        throw new NotFoundException('File was not found in object storage');
      }

      this.logger.error(
        `Failed to download attachment object ${objectKey} from bucket ${resolvedBucket}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new ServiceUnavailableException({
        code: 'ATTACHMENT_STORAGE_DOWNLOAD_FAILED',
        message: 'Failed to download attachment from object storage',
        details: this.normalizeStorageError(error),
      });
    }
  }

  async delete(
    objectKey: string,
    _storagePath?: string | null,
    bucket?: string | null,
  ) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket || this.bucket,
        Key: objectKey,
      }),
    );
  }

  private isObjectNotFoundError(error: unknown) {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as {
      name?: string;
      Code?: string;
      code?: string;
      $metadata?: { httpStatusCode?: number };
    };
    const code = candidate.name ?? candidate.Code ?? candidate.code;

    return (
      (error instanceof S3ServiceException &&
        error.$metadata?.httpStatusCode === 404) ||
      code === 'NoSuchKey' ||
      code === 'NotFound' ||
      code === 'NoSuchBucket' ||
      code === 'NotFoundError' ||
      code === 'NoSuchObject' ||
      candidate.$metadata?.httpStatusCode === 404
    );
  }

  private normalizeStorageError(error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    return {
      message: 'Unknown object storage error',
    };
  }
}
