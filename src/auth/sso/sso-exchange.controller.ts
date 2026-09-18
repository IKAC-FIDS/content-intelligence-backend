import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "../auth.service";
import { CookieOriginGuard } from '../../common/guards/cookie-origin.guard';
import { setRefreshTokenCookie } from "../../common/cookies/refresh-token-cookie";
import { ExchangeSsoTicketDto } from "./dto/exchange-sso-ticket.dto";
import { PrismaService } from "../../prisma/prisma.service";
import { SsoTicketService } from "./sso-ticket.service";
import { TenantResolverService } from "../../organization-memberships/tenant-resolver.service";

@Controller("auth/sso")
@UseGuards(CookieOriginGuard)
export class SsoExchangeController {
  constructor(
    private readonly ticketService: SsoTicketService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  @Post("exchange")
  async exchange(
    @Body() dto: ExchangeSsoTicketDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const consumed = await this.ticketService.consumeTicket(dto.ticket);

    const user = await this.prisma.user.findUnique({
      where: { id: consumed.userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("SSO user is not active");
    }

    if (!consumed.providerId)
      throw new UnauthorizedException("SSO provider context is missing");
    const provider = await this.prisma.ssoProvider.findUnique({
      where: { id: consumed.providerId },
      select: {
        organizationId: true,
        isActive: true,
        organization: { select: { status: true } },
      },
    });
    if (
      !provider?.organizationId ||
      !provider.isActive ||
      provider.organization?.status !== "ACTIVE"
    )
      throw new UnauthorizedException("SSO provider is not operational");
    const tenant = await this.tenantResolver.selectTenant(
      user.id,
      provider.organizationId,
    );

    const result = await this.authService.buildSessionLoginResponse(
      user,
      req,
      tenant,
    );

    setRefreshTokenCookie(
      res,
      result.refreshToken,
      result.refreshTokenMaxAgeMs,
    );

    return this.authService.toPublicAuthResponse(result);
  }
}
