import { Module } from '@nestjs/common';
import { CompanySocialChannelsService } from './company-social-channels.service';
import { CompanySocialChannelsController } from './company-social-channels.controller';

@Module({
  providers: [CompanySocialChannelsService],
  controllers: [CompanySocialChannelsController],
})
export class CompanySocialChannelsModule {}