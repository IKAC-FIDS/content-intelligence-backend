import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { RefreshTokenService } from '../src/auth/refresh-token.service';

const activeUser = { id: 'user-a', isActive: true };

function setup() {
  const stored = new Map<string, any>();
  const prisma = {
    refreshSession: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `session-${stored.size + 1}`, ...data, user: activeUser };
        stored.set(data.refreshTokenHash, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => stored.get(where.refreshTokenHash) ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
  };
  const config = {
    get: jest.fn((_key: string, fallback: string) => fallback),
  };
  return {
    prisma,
    service: new RefreshTokenService(prisma as any, config as any),
  };
}

describe('RefreshTokenService Tenant context', () => {
  it('binds newly issued refresh tokens to server-issued Tenant identifiers', async () => {
    const { service } = setup();
    const created = await service.createSession(
      activeUser.id,
      undefined,
      undefined,
      { activeOrganizationId: 'org-a', membershipId: 'membership-a' },
    );
    expect(created.refreshToken).toMatch(/^rt2\./);
    await expect(service.getActiveSession(created.refreshToken)).resolves.toMatchObject({
      user: activeUser,
      tenantContext: {
        activeOrganizationId: 'org-a',
        membershipId: 'membership-a',
      },
    });
  });

  it('keeps legacy opaque refresh sessions compatible without inventing Tenant claims', async () => {
    const { prisma, service } = setup();
    const token = 'legacy-random-refresh-token';
    const hash = createHash('sha256').update(token).digest('hex');
    prisma.refreshSession.findUnique.mockResolvedValue({
      id: 'legacy-session',
      userId: activeUser.id,
      user: activeUser,
      refreshTokenHash: hash,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.getActiveSession(token)).resolves.toMatchObject({
      tenantContext: null,
    });
  });

  it('does not trust modified client token context because the full token hash must match', async () => {
    const { service } = setup();
    const created = await service.createSession(
      activeUser.id,
      undefined,
      undefined,
      { activeOrganizationId: 'org-a', membershipId: 'membership-a' },
    );
    const parts = created.refreshToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    payload.activeOrganizationId = 'org-b';
    const tampered = `rt2.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${parts[2]}`;
    await expect(service.getActiveSession(tampered)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rotates a legacy session into the selected Tenant context and revokes the old session', async () => {
    const { prisma, service } = setup();
    const legacyToken = 'legacy-refresh-token';
    const legacyHash = createHash('sha256').update(legacyToken).digest('hex');
    const legacy = {
      id: 'legacy-session',
      userId: activeUser.id,
      user: activeUser,
      refreshTokenHash: legacyHash,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    prisma.refreshSession.findUnique.mockResolvedValueOnce(legacy);
    const rotated = await service.rotateRefreshToken(
      legacyToken,
      undefined,
      { activeOrganizationId: 'org-b', membershipId: 'membership-b' },
    );
    expect(rotated.tenantContext).toEqual({
      activeOrganizationId: 'org-b',
      membershipId: 'membership-b',
    });
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'legacy-session', revokedAt: null }),
        data: expect.objectContaining({ revokedReason: 'ROTATED' }),
      }),
    );
  });
});
