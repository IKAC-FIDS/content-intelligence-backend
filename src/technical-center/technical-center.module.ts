import { Module } from '@nestjs/common';
import {
  TechnicalDocumentsController,
  TechnicalKnowledgeController,
  TechnicalReleasesController,
  TechnicalResourcesController,
  TechnicalTendersController,
} from './technical-center.controller';
import { TechnicalCenterService } from './technical-center.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [NotificationsModule, TasksModule, AttachmentsModule],
  controllers: [
    TechnicalReleasesController,
    TechnicalKnowledgeController,
    TechnicalDocumentsController,
    TechnicalResourcesController,
    TechnicalTendersController,
  ],
  providers: [TechnicalCenterService],
  exports: [TechnicalCenterService],
})
export class TechnicalCenterModule {}
