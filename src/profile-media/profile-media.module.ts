import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { ProfileMediaService } from './profile-media.service';

@Module({
  imports: [AttachmentsModule],
  providers: [ProfileMediaService],
  exports: [ProfileMediaService],
})
export class ProfileMediaModule {}
