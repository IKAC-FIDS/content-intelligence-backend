import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
} from '../common/cookies/refresh-token-cookie';
import { SessionsService } from './sessions.service';
import { CookieOriginGuard } from '../common/guards/cookie-origin.guard';

@Controller('auth/sessions')
@UseGuards(JwtAuthGuard, CookieOriginGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  async listMySessions(
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    const currentRefreshToken = getRefreshTokenFromRequest(req);

    return this.sessionsService.listMySessions(
      user.userId,
      currentRefreshToken,
    );
  }

  @Delete(':sessionId')
  @HttpCode(HttpStatus.OK)
  async revokeMySession(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const currentRefreshToken = getRefreshTokenFromRequest(req);

    const result = await this.sessionsService.revokeMySession(
      user.userId,
      sessionId,
      currentRefreshToken,
    );

    if (result.revokedCurrentSession) {
      clearRefreshTokenCookie(res);
    }

    return {
      success: true,
      ...result,
    };
  }
}
