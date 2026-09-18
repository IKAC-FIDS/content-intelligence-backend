import { Module } from '@nestjs/common';
import { PainPointsService } from './pain-points.service';
import { PainPointsController } from './pain-points.controller';

@Module({
  providers: [PainPointsService],
  controllers: [PainPointsController],
  exports: [PainPointsService],
})
export class PainPointsModule {}