import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { NotificationCoreModule } from '../notification-core/notification-core.module';

@Module({
  imports: [NotificationsModule, NotificationCoreModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
