import { Module } from '@nestjs/common';
import { PipelineConfigModule } from '../admin/pipeline/pipeline-config.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { CompanyOpportunitiesController } from './company-opportunities.controller';
import { OpportunityCommercialDocumentsController } from './opportunity-commercial-documents.controller';
import { OpportunityCommercialDocumentsService } from './opportunity-commercial-documents.service';
import { OpportunityLineItemsController } from './opportunity-line-items.controller';
import { OpportunityLineItemsService } from './opportunity-line-items.service';
import { OpportunityPaymentsController } from './opportunity-payments.controller';
import { OpportunityPaymentsService } from './opportunity-payments.service';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { QuotaModule } from '../quota/quota.module';
import { NotificationCoreModule } from '../notification-core/notification-core.module';

@Module({
  imports: [PipelineConfigModule, AttachmentsModule, QuotaModule, NotificationCoreModule],
  controllers: [
    OpportunitiesController,
    CompanyOpportunitiesController,
    OpportunityLineItemsController,
    OpportunityCommercialDocumentsController,
    OpportunityPaymentsController,
  ],
  providers: [
    OpportunitiesService,
    OpportunityLineItemsService,
    OpportunityCommercialDocumentsService,
    OpportunityPaymentsService,
  ],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
