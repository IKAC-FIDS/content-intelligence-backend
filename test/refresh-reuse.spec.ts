import { ConfigService } from '@nestjs/config';
import { RefreshTokenService } from '../src/auth/refresh-token.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('refresh rotation interleavings (regression evidence)', () => {
  const row = () => ({ id: 'old', userId: 'user', user: { id: 'user', isActive: true }, expiresAt: new Date(Date.now() + 60_000), revokedAt: null });
  function setup() {
    const prisma = {
      refreshSession: {
        findUnique: jest.fn().mockResolvedValue(row()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    const service = new RefreshTokenService(prisma as unknown as PrismaService, new ConfigService());
    return { prisma, service };
  }
  it('revokes ALL active user sessions if a second rotation reads the already rotated row', async () => {
    const { prisma, service } = setup();
    await service.getActiveSession('R1'); // Tab B precheck succeeds before A rotates.
    await service.rotateRefreshToken('R1'); // Tab A.
    prisma.refreshSession.findUnique.mockResolvedValue({ ...row(), revokedAt: new Date() });
    await expect(service.rotateRefreshToken('R1')).rejects.toThrow(); // Tab B.
    expect(prisma.refreshSession.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user', revokedAt: null }),
      data: expect.objectContaining({ revokedReason: 'REUSE_DETECTED' }),
    }));
  });
  it('rejects the CAS loser without mass revocation when both reads were active', async () => {
    const { prisma, service } = setup();
    prisma.refreshSession.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.rotateRefreshToken('R1')).rejects.toThrow('no longer valid');
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.refreshSession.create).not.toHaveBeenCalled();
  });
  it('detects replay at the precheck, not only inside rotation', async () => {
    const { prisma, service } = setup();
    prisma.refreshSession.findUnique.mockResolvedValue({ ...row(), revokedAt: new Date(), revokedReason: 'ROTATED' });
    await expect(service.getActiveSession('R1')).rejects.toThrow();
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revokedReason: 'REUSE_DETECTED' }) }));
  });
});
