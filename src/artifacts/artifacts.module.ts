import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { ArtifactsController } from './artifacts.controller';
import { ArtifactsService } from './artifacts.service';

@Module({ imports: [AttachmentsModule], controllers: [ArtifactsController], providers: [ArtifactsService], exports: [ArtifactsService] })
export class ArtifactsModule {}
