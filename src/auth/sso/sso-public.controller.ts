import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { SsoProviderService } from "./sso-provider.service";

@Controller("auth/sso")
export class SsoPublicController {
  constructor(private readonly service: SsoProviderService) {}

  @Get("providers")
  listProviders(
    @Query("domain") domain?: string,
    @Query("subdomain") subdomain?: string,
  ) {
    if (Boolean(domain) === Boolean(subdomain))
      throw new BadRequestException(
        "Exactly one verified tenant route is required",
      );
    return this.service.discoverPublicProviders(
      domain ? "DOMAIN" : "SUBDOMAIN",
      domain ?? subdomain!,
    );
  }
}
