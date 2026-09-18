import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, User } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export interface CreatedRefreshSession {
  refreshToken: string;
  refreshTokenMaxAgeMs: number;
  refreshTokenExpiresAt: Date;
  refreshSessionId: string;
  tenantContext: RefreshSessionContext | null;
}

export interface RotatedRefreshSession extends CreatedRefreshSession {
  user: User;
}

export interface RefreshTenantContext {
  activeOrganizationId: string;
  membershipId: string;
}

export interface PlatformRefreshContext {
  platformOnly: true;
}

export type RefreshSessionContext = RefreshTenantContext | PlatformRefreshContext;

export interface ActiveRefreshSession {
  user: User;
  refreshSessionId: string;
  tenantContext: RefreshSessionContext | null;
}

export interface UserSessionResponse {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  current: boolean;
}

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getActiveUser(refreshToken: string): Promise<User> {
    return (await this.getActiveSession(refreshToken)).user;
  }

  async getActiveSession(refreshToken: string): Promise<ActiveRefreshSession> {
    const session = await this.prisma.refreshSession.findUnique({
      where: { refreshTokenHash: this.hashRefreshToken(refreshToken) },
      include: { user: true },
    });
    // The precheck must not bypass replay detection used by rotation.
    if (session?.revokedAt && session.revokedReason === 'ROTATED') {
      await this.revokeActiveSessionsForUser(session.userId, 'REUSE_DETECTED');
    }
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.isActive
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return {
      user: session.user,
      refreshSessionId: session.id,
      tenantContext: this.parseTenantContext(refreshToken),
    };
  }

  async createSession(
    userId: string,
    req?: Request,
    tx?: Prisma.TransactionClient,
    tenantContext?: RefreshSessionContext | null,
  ): Promise<CreatedRefreshSession> {
    const prisma = tx ?? this.prisma;

    const refreshToken = this.generateRefreshToken(tenantContext);
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const refreshTokenMaxAgeMs = this.getRefreshTokenTtlMs();
    const refreshTokenExpiresAt = new Date(Date.now() + refreshTokenMaxAgeMs);

    const session = await prisma.refreshSession.create({
      data: {
        userId,
        refreshTokenHash,
        userAgent: this.extractUserAgent(req),
        ipAddress: this.extractIpAddress(req),
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return {
      refreshToken,
      refreshTokenMaxAgeMs,
      refreshTokenExpiresAt,
      refreshSessionId: session.id,
      tenantContext: tenantContext ?? null,
    };
  }

  async rotateRefreshToken(
    refreshToken: string,
    req?: Request,
    nextTenantContext?: RefreshSessionContext | null,
  ): Promise<RotatedRefreshSession> {
    const oldHash = this.hashRefreshToken(refreshToken);

    const existingSession = await this.prisma.refreshSession.findUnique({
      where: { refreshTokenHash: oldHash },
      include: { user: true },
    });

    if (!existingSession) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existingSession.revokedAt) {
      await this.revokeActiveSessionsForUser(
        existingSession.userId,
        'REUSE_DETECTED',
      );

      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (existingSession.expiresAt <= new Date()) {
      await this.prisma.refreshSession.updateMany({
        where: {
          id: existingSession.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          revokedReason: 'EXPIRED',
        },
      });

      throw new UnauthorizedException('Refresh token has expired');
    }

    if (!existingSession.user.isActive) {
      throw new UnauthorizedException('User is inactive');
    }

    const currentTenantContext = this.parseTenantContext(refreshToken);
    const tenantContext = nextTenantContext ?? currentTenantContext;
    const newRefreshToken = this.generateRefreshToken(tenantContext);
    const newRefreshTokenHash = this.hashRefreshToken(newRefreshToken);
    const refreshTokenMaxAgeMs = this.getRefreshTokenTtlMs();
    const refreshTokenExpiresAt = new Date(Date.now() + refreshTokenMaxAgeMs);
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const revokeResult = await tx.refreshSession.updateMany({
        where: {
          id: existingSession.id,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          revokedAt: now,
          revokedReason: 'ROTATED',
          lastUsedAt: now,
        },
      });

      if (revokeResult.count !== 1) {
        throw new UnauthorizedException('Refresh token is no longer valid');
      }

      const newSession = await tx.refreshSession.create({
        data: {
          userId: existingSession.userId,
          refreshTokenHash: newRefreshTokenHash,
          userAgent: this.extractUserAgent(req),
          ipAddress: this.extractIpAddress(req),
          expiresAt: refreshTokenExpiresAt,
          lastUsedAt: now,
        },
      });

      await tx.refreshSession.update({
        where: { id: existingSession.id },
        data: {
          replacedBySessionId: newSession.id,
        },
      });

      return newSession;
    });

    return {
      user: existingSession.user,
      refreshToken: newRefreshToken,
      refreshTokenMaxAgeMs,
      refreshTokenExpiresAt,
      refreshSessionId: result.id,
      tenantContext,
    };
  }

  async revokeByToken(
    refreshToken: string,
    reason = 'LOGOUT',
  ): Promise<void> {
    const hash = this.hashRefreshToken(refreshToken);

    await this.prisma.refreshSession.updateMany({
      where: {
        refreshTokenHash: hash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  async revokeAllUserSessions(
    userId: string,
    reason = 'LOGOUT_ALL',
  ): Promise<number> {
    const result = await this.prisma.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });

    return result.count;
  }

  async listUserSessions(
    userId: string,
    currentRefreshToken?: string,
  ): Promise<UserSessionResponse[]> {
    const currentHash = currentRefreshToken
      ? this.hashRefreshToken(currentRefreshToken)
      : null;

    const sessions = await this.prisma.refreshSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      current: currentHash
        ? session.refreshTokenHash === currentHash
        : false,
    }));
  }

  async revokeUserSession(
    userId: string,
    sessionId: string,
    currentRefreshToken?: string,
  ): Promise<{ revokedCurrentSession: boolean }> {
    const session = await this.prisma.refreshSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const currentHash = currentRefreshToken
      ? this.hashRefreshToken(currentRefreshToken)
      : null;

    await this.prisma.refreshSession.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: 'SESSION_REVOKED',
      },
    });

    return {
      revokedCurrentSession: currentHash
        ? session.refreshTokenHash === currentHash
        : false,
    };
  }

async revokeAllUserSessionsExceptToken(
  userId: string,
  refreshToken: string,
  reason = 'LOGOUT_OTHER_SESSIONS',
): Promise<number> {
  const currentHash = this.hashRefreshToken(refreshToken);

  const result = await this.prisma.refreshSession.updateMany({
    where: {
      userId,
      refreshTokenHash: {
        not: currentHash,
      },
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });

  return result.count;
}

  private async revokeActiveSessionsForUser(
    userId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  private generateRefreshToken(
    tenantContext?: RefreshSessionContext | null,
  ): string {
    const random = randomBytes(64).toString('base64url');
    if (!tenantContext) return random;
    if ('platformOnly' in tenantContext) {
      const payload = Buffer.from(JSON.stringify({ v: 3, platformOnly: true }), 'utf8').toString('base64url');
      return `rt3.${payload}.${random}`;
    }
    const payload = Buffer.from(
      JSON.stringify({
        v: 2,
        activeOrganizationId: tenantContext.activeOrganizationId,
        membershipId: tenantContext.membershipId,
      }),
      'utf8',
    ).toString('base64url');
    return `rt2.${payload}.${random}`;
  }

  private parseTenantContext(refreshToken: string): RefreshSessionContext | null {
    const parts = refreshToken.split('.');
    if (parts.length !== 3 || !['rt2', 'rt3'].includes(parts[0])) return null;
    try {
      const value = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      if (parts[0] === 'rt3' && value.v === 3 && value.platformOnly === true) {
        return { platformOnly: true };
      }
      if (
        value.v !== 2 ||
        typeof value.activeOrganizationId !== 'string' ||
        !value.activeOrganizationId ||
        typeof value.membershipId !== 'string' ||
        !value.membershipId
      ) {
        return null;
      }
      return {
        activeOrganizationId: value.activeOrganizationId,
        membershipId: value.membershipId,
      };
    } catch {
      return null;
    }
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private getRefreshTokenTtlMs(): number {
    const value = this.config.get<string>('REFRESH_TOKEN_EXPIRES_IN', '30d');
    return this.parseDurationToMs(value);
  }

  private parseDurationToMs(value: string): number {
    const match = value.match(/^(\d+)([smhdw])$/);

    if (!match) {
      return 30 * 24 * 60 * 60 * 1000;
    }

    const amount = Number(match[1]);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
    };

    return amount * multipliers[unit];
  }

  private extractUserAgent(req?: Request): string | null {
    const value = req?.headers['user-agent'];

    if (!value) {
      return null;
    }

    return Array.isArray(value) ? value.join(' ') : value;
  }

  private extractIpAddress(req?: Request): string | null {
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
