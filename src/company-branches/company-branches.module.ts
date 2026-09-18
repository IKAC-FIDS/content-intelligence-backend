import { Module } from '@nestjs/common';
import { CompanyBranchesService } from './company-branches.service';
import { CompanyBranchesController } from './company-branches.controller';

@Module({
  providers: [CompanyBranchesService],
  controllers: [CompanyBranchesController],
})
export class CompanyBranchesModule {}