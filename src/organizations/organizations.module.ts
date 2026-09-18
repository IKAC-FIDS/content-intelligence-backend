import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { PlatformAuthorityModule } from '../platform-authority/platform-authority.module';
import { PlatformOrganizationsController } from './platform-organizations.controller';
import { OrganizationConfigurationService } from './organization-configuration.service';
import { OrganizationDomainVerificationService } from './organization-domain-verification.service';

@Module({
  imports: [PlatformAuthorityModule],
  controllers: [OrganizationsController, PlatformOrganizationsController],
  providers: [OrganizationsService, OrganizationConfigurationService, OrganizationDomainVerificationService],
  exports: [OrganizationsService, OrganizationConfigurationService],
})
export class OrganizationsModule {}
