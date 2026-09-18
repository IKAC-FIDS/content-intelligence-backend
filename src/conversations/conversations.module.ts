import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationCoreModule } from '../notification-core/notification-core.module';
import { TasksModule } from '../tasks/tasks.module';
import { ConversationAccessService } from './conversation-access.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [TasksModule, ActivitiesModule, NotificationCoreModule, AuditLogModule],
  controllers: [ConversationsController],
  providers: [ConversationAccessService, ConversationsService],
})
export class ConversationsModule {}
