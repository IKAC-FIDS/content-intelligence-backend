import { Controller, Get, Param, Query, Redirect } from "@nestjs/common";
import { OidcService } from "./oidc.service";

@Controller("auth/oidc")
export class OidcController {
  constructor(private readonly oidcService: OidcService) {}

  @Get(":providerId/login")
  @Redirect()
  async login(
    @Param("providerId") providerId: string,
    @Query("domain") domain?: string,
    @Query("subdomain") subdomain?: string,
  ) {
    const url = await this.oidcService.buildAuthorizationUrl(
      providerId,
      domain ? "DOMAIN" : "SUBDOMAIN",
      domain ?? subdomain ?? "",
    );

    return {
      url,
      statusCode: 302,
    };
  }

  @Get(":providerId/callback")
  @Redirect()
  async callback(
    @Param("providerId") providerId: string,
    @Query() query: Record<string, string>,
  ) {
    const url = await this.oidcService.handleCallback(providerId, query);

    return {
      url,
      statusCode: 302,
    };
  }
}
