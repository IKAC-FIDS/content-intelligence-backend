import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ATTACHMENT_STORAGE } from './storage/attachment-storage.types';
import { LocalAttachmentStorageService } from './storage/local-attachment-storage.service';
import { MinioAttachmentStorageService } from './storage/minio-attachment-storage.service';

@Module({
  providers: [
    {
      provide: ATTACHMENT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('ATTACHMENT_STORAGE_DRIVER', 'local');

        if (driver === 'minio') {
          return new MinioAttachmentStorageService(config);
        }

        return new LocalAttachmentStorageService(config);
      },
    },
  ],
  exports: [ATTACHMENT_STORAGE],
})
export class AttachmentsModule {}
