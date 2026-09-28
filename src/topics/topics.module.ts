import { Module } from '@nestjs/common';
import { PlatformAuthorityModule } from '../platform-authority/platform-authority.module';
import { PlatformTopicsController, TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';
@Module({ imports: [PlatformAuthorityModule], controllers: [TopicsController, PlatformTopicsController], providers: [TopicsService], exports: [TopicsService] })
export class TopicsModule {}
