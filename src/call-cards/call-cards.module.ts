import { Module } from '@nestjs/common';
import { CallCardsService } from './call-cards.service';
import { CallCardsController } from './call-cards.controller';

@Module({
  providers: [CallCardsService],
  controllers: [CallCardsController],
})
export class CallCardsModule {}