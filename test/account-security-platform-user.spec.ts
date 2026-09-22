import { AccountSecurityService } from '../src/auth/account-security.service';

describe('AccountSecurityService platform account view', () => {
  it('selects account-security fields without legacy role or Team identity', async () => {
    const user = {
      id: 'user-a',
      fullName: 'User A',
      email: 'user-a@example.test',
      isActive: true,
      passwordChangedAt: null,
      lastLoginAt: null,
      lastLoginIp: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    };
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      refreshSession: { count: jest.fn().mockResolvedValue(2) },
    };
    const service = new AccountSecurityService(prisma, {} as any);

    await expect(service.getSecurityOverview('user-a')).resolves.toMatchObject({
      ...user,
      activeSessionsCount: 2,
      isLocked: false,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-a' },
      select: {
        id: true,
        fullName: true,
        email: true,
        isActive: true,
        passwordChangedAt: true,
        lastLoginAt: true,
        lastLoginIp: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        createdAt: true,
      },
    });
    const result = await service.getSecurityOverview('user-a');
    expect(result).not.toHaveProperty('role');
    expect(result).not.toHaveProperty('team');
  });
});
