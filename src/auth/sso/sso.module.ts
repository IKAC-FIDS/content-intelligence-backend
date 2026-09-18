import { Module } from "@nestjs/common";
import { AuthModule } from "../auth.module";
import { OidcController } from "./oidc.controller";
import { OidcService } from "./oidc.service";
import { SsoAdminController } from "./sso-admin.controller";
import { SsoExchangeController } from "./sso-exchange.controller";
import { SsoPublicController } from "./sso-public.controller";
import { SsoProviderService } from "./sso-provider.service";
import { SsoSecretService } from "./sso-secret.service";
import { SsoTicketService } from "./sso-ticket.service";
import { SamlController } from "./saml.controller";
import { SamlService } from "./saml.service";
import { OrganizationMembershipsModule } from "../../organization-memberships/organization-memberships.module";
import { SsoNetworkSecurityService } from "./sso-network-security.service";
import { EntitlementsModule } from "../../entitlements/entitlements.module";

@Module({
  imports: [AuthModule, OrganizationMembershipsModule, EntitlementsModule],
  controllers: [
    SsoPublicController,
    SsoAdminController,
    OidcController,
    SamlController,
    SsoExchangeController,
  ],
  providers: [
    SsoProviderService,
    SsoSecretService,
    SsoTicketService,
    OidcService,
    SamlService,
    SsoNetworkSecurityService,
  ],
  exports: [
    SsoProviderService,
    SsoSecretService,
    SsoTicketService,
    OidcService,
    SamlService,
  ],
})
export class SsoModule {}
