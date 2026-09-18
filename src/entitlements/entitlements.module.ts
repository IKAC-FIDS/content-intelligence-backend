import { Module } from '@nestjs/common';
import { PlatformAuthorityModule } from '../platform-authority/platform-authority.module';
import { EntitlementService } from './entitlement.service';
import { FeatureGuard } from './feature.guard';
import { PlatformEntitlementsService } from './platform-entitlements.service';
import { PlatformPlansController, PlatformSubscriptionsController, PlatformSubscriptionTransitionsController, TenantEntitlementsController } from './entitlements.controller';
@Module({ imports: [PlatformAuthorityModule], controllers: [PlatformPlansController, PlatformSubscriptionsController, PlatformSubscriptionTransitionsController, TenantEntitlementsController], providers: [EntitlementService, PlatformEntitlementsService, FeatureGuard], exports: [EntitlementService, FeatureGuard] })
export class EntitlementsModule {}
