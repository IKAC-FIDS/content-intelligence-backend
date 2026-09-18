import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { buildHttpLogContext } from '../common/logging/http-log-context';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
  setRefreshTokenCookie,
} from '../common/cookies/refresh-token-cookie';
import { AuthService } from './auth.service';
import { CookieOriginGuard } from '../common/guards/cookie-origin.guard';
import { LoginDto } from './dto/login.dto';
import { SwitchTenantDto } from './dto/switch-tenant.dto';

@Controller('auth')
@UseGuards(CookieOriginGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, req);

    setRefreshTokenCookie(
      res,
      result.refreshToken,
      result.refreshTokenMaxAgeMs,
    );

    const context = buildHttpLogContext(req, res);
    this.logger.log(
      'Login refresh cookie set',
      JSON.stringify({
        requestId: context.requestId,
        origin: context.origin,
        userAgent: context.userAgent,
      }),
    );

    return this.authService.toPublicAuthResponse(result);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = getRefreshTokenFromRequest(req);

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is missing');
    }

    const result = await this.authService.refresh(refreshToken, req);

    setRefreshTokenCookie(
      res,
      result.refreshToken,
      result.refreshTokenMaxAgeMs,
    );

    return this.authService.toPublicAuthResponse(result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = getRefreshTokenFromRequest(req);

    await this.authService.logout(refreshToken);

    clearRefreshTokenCookie(res);

    return {
      success: true,
    };
  }

  @Post('switch-tenant')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async switchTenant(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SwitchTenantDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is missing');
    }
    const result = await this.authService.switchTenant(
      user,
      dto.organizationId,
      refreshToken,
      req,
    );
    setRefreshTokenCookie(
      res,
      result.refreshToken,
      result.refreshTokenMaxAgeMs,
    );
    return this.authService.toPublicAuthResponse(result);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logoutAll(user.userId);

    clearRefreshTokenCookie(res);

    return {
      success: true,
      ...result,
    };
  }
}
