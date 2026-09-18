import { Module } from '@nestjs/common';
import { UseCasesService } from './use-cases.service';
import { UseCasesController } from './use-cases.controller';

@Module({
  providers: [UseCasesService],
  controllers: [UseCasesController],
  exports: [UseCasesService],
})
export class UseCasesModule {}