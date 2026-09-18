import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PlatformAuthorityModule } from '../platform-authority/platform-authority.module';
import { ApiUsageInterceptor } from './api-usage.interceptor';
import {
  PlatformOrganizationQuotaController,
  PlatformPlanQuotaController,
  TenantQuotaController,
} from './quota.controller';
import { PlatformQuotaService } from './platform-quota.service';
import { QuotaResolverService } from './quota-resolver.service';
import { QuotaSchedulerService } from './quota-scheduler.service';
import { QuotaService } from './quota.service';
import { UsageReconciliationService } from './usage-reconciliation.service';

@Module({
  imports: [PlatformAuthorityModule],
  controllers: [
    PlatformPlanQuotaController,
    PlatformOrganizationQuotaController,
    TenantQuotaController,
  ],
  providers: [
    QuotaResolverService,
    QuotaService,
    PlatformQuotaService,
    UsageReconciliationService,
    QuotaSchedulerService,
    { provide: APP_INTERCEPTOR, useClass: ApiUsageInterceptor },
  ],
  exports: [QuotaResolverService, QuotaService, UsageReconciliationService],
})
export class QuotaModule {}
