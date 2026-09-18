import { Injectable } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';

@Injectable()
export class SessionsService {
  constructor(private readonly refreshTokenService: RefreshTokenService) {}

  listMySessions(userId: string, currentRefreshToken?: string) {
    return this.refreshTokenService.listUserSessions(
      userId,
      currentRefreshToken,
    );
  }

  revokeMySession(
    userId: string,
    sessionId: string,
    currentRefreshToken?: string,
  ) {
    return this.refreshTokenService.revokeUserSession(
      userId,
      sessionId,
      currentRefreshToken,
    );
  }
}