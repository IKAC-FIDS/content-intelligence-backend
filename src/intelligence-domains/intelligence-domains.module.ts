import { Module } from '@nestjs/common';
import { PlatformAuthorityModule } from '../platform-authority/platform-authority.module';
import { IntelligenceDomainsController, PlatformIntelligenceDomainsController } from './intelligence-domains.controller';
import { IntelligenceDomainsService } from './intelligence-domains.service';

@Module({ imports: [PlatformAuthorityModule], controllers: [IntelligenceDomainsController, PlatformIntelligenceDomainsController], providers: [IntelligenceDomainsService], exports: [IntelligenceDomainsService] })
export class IntelligenceDomainsModule {}
