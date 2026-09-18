import { NotificationType, UserRole } from '@prisma/client';
import { NotificationsService } from '../src/notifications/notifications.service';
import { tenantUser } from './helpers/tenant-user';

describe('NotificationsService metadata compatibility', () => {
  it('returns existing notification metadata unchanged', async () => {
    const metadata = {
      meetingTitle: 'معرفی محصول',
      meetingStartAt: '2026-07-27T04:30:00.000Z',
      meetingEndAt: '2026-07-27T05:30:00.000Z',
      reminderAt: '2026-07-27T04:15:00.000Z',
      organizationTimeZone: 'Asia/Tehran',
    };
    const notification = {
      id: 'notification-1',
      type: NotificationType.MEETING_REMINDER,
      metadata,
    };
    const prisma: any = {
      notification: {
        findMany: jest.fn().mockResolvedValue([notification]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    prisma.withTenantTransaction = jest.fn(
      async (_context: unknown, callback: (tx: unknown) => unknown) =>
        callback(prisma),
    );
    const service = new NotificationsService(
      prisma as any,
      { record: jest.fn() } as any,
    );

    const result = await service.findAll(
      {},
      tenantUser({
        userId: 'user-1',
        email: 'user@example.com',
        role: UserRole.ADMIN,
        organizationId: 'organization-1',
      }),
    );

    expect(result.data[0].metadata).toBe(metadata);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              organizationId: 'organization-1',
              recipientId: 'user-1',
            },
            { archivedAt: null },
          ],
        },
      }),
    );
  });

  it('continues searching notification title and body only', async () => {
    const prisma: any = {
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    prisma.withTenantTransaction = jest.fn(
      async (_context: unknown, callback: (tx: unknown) => unknown) =>
        callback(prisma),
    );
    const service = new NotificationsService(
      prisma as any,
      { record: jest.fn() } as any,
    );

    await service.findAll(
      { search: 'معرفی محصول' },
      tenantUser({
        userId: 'user-1',
        email: 'user@example.com',
        role: UserRole.ADMIN,
        organizationId: 'organization-1',
      }),
    );

    const where = prisma.notification.findMany.mock.calls[0][0].where;
    expect(where.AND[2]).toEqual({
      OR: [
        { title: { contains: 'معرفی محصول', mode: 'insensitive' } },
        { body: { contains: 'معرفی محصول', mode: 'insensitive' } },
      ],
    });
    expect(JSON.stringify(where)).not.toContain('metadata');
  });
});
