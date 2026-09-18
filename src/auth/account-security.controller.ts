import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
} from '../common/cookies/refresh-token-cookie';
import { AccountSecurityService } from './account-security.service';
import { CookieOriginGuard } from '../common/guards/cookie-origin.guard';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth/account')
@UseGuards(JwtAuthGuard, CookieOriginGuard)
export class AccountSecurityController {
  constructor(
    private readonly accountSecurityService: AccountSecurityService,
  ) {}

  @Get('security')
  getSecurityOverview(@CurrentUser() user: CurrentUserPayload) {
    return this.accountSecurityService.getSecurityOverview(user.userId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.accountSecurityService.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
    );

    clearRefreshTokenCookie(res);

    return result;
  }

  @Post('logout-other-sessions')
  @HttpCode(HttpStatus.OK)
  async logoutOtherSessions(
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    const currentRefreshToken = getRefreshTokenFromRequest(req);

    return this.accountSecurityService.logoutOtherSessions(
      user.userId,
      currentRefreshToken,
    );
  }
}
