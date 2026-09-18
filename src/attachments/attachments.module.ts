import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { ATTACHMENT_STORAGE } from './storage/attachment-storage.types';
import { LocalAttachmentStorageService } from './storage/local-attachment-storage.service';
import { MinioAttachmentStorageService } from './storage/minio-attachment-storage.service';
import { QuotaModule } from '../quota/quota.module';

@Module({
  imports: [QuotaModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
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
  exports: [AttachmentsService, ATTACHMENT_STORAGE],
})
export class AttachmentsModule {}
