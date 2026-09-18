import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokenService } from './refresh-token.service';

@Injectable()
export class AccountSecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async getSecurityOverview(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        team: true,
        isActive: true,
        passwordChangedAt: true,
        lastLoginAt: true,
        lastLoginIp: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        createdAt: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive');
    }

    const activeSessionsCount = await this.prisma.refreshSession.count({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    return {
      ...user,
      activeSessionsCount,
      isLocked: user.lockedUntil ? user.lockedUntil > new Date() : false,
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'رمز عبور جدید نباید با رمز عبور فعلی یکسان باشد',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive');
    }

    const currentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );

    if (!currentPasswordValid) {
      throw new UnauthorizedException('رمز عبور فعلی نادرست است');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await this.refreshTokenService.revokeAllUserSessions(
      userId,
      'PASSWORD_CHANGED',
    );

    return {
      success: true,
      message: 'رمز عبور با موفقیت تغییر کرد. لطفاً دوباره وارد شوید.',
      requiresLogin: true,
    };
  }

  async logoutOtherSessions(userId: string, currentRefreshToken?: string) {
    if (!currentRefreshToken) {
      const revokedCount = await this.refreshTokenService.revokeAllUserSessions(
        userId,
        'LOGOUT_OTHER_SESSIONS_NO_CURRENT_TOKEN',
      );

      return {
        success: true,
        revokedCount,
        currentSessionKept: false,
      };
    }

    const revokedCount =
      await this.refreshTokenService.revokeAllUserSessionsExceptToken(
        userId,
        currentRefreshToken,
        'LOGOUT_OTHER_SESSIONS',
      );

    return {
      success: true,
      revokedCount,
      currentSessionKept: true,
    };
  }

  extractIpAddress(req?: Request): string | null {
    const forwardedFor = req?.headers['x-forwarded-for'];

    if (Array.isArray(forwardedFor)) {
      return forwardedFor[0]?.split(',')[0]?.trim() || null;
    }

    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0]?.trim() || null;
    }

    return req?.ip || req?.socket?.remoteAddress || null;
  }
}