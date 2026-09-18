import {
  MeetingStatus,
  NotificationEntityType,
  NotificationType,
} from '@prisma/client';
import { MeetingReminderService } from '../src/meetings/meeting-reminder.service';

const startAt = new Date('2026-07-27T04:30:00.000Z');
const endAt = new Date('2026-07-27T05:30:00.000Z');
const reminderAt = new Date('2026-07-27T04:15:00.000Z');

function meeting(overrides: Record<string, unknown> = {}) {
  return {
    id: 'meeting-1',
    organizationId: 'organization-1',
    title: 'معرفی محصول',
    startAt,
    endAt,
    reminderAt,
    organizerId: 'user-1',
    assignees: [{ userId: 'user-1' }, { userId: 'user-2' }, { userId: 'user-2' }],
    organization: { timezone: 'Europe/Berlin' },
    ...overrides,
  };
}

function setup(due = [meeting()]) {
  const order: string[] = [];
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
    meeting: {
      findMany: jest.fn().mockResolvedValue(due),
      update: jest.fn(async () => {
        order.push('meeting.update');
        return {};
      }),
    },
    notification: {
      createMany: jest.fn(async () => {
        order.push('notification.createMany');
        return { count: 2 };
      }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    installTenantContext: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  return {
    order,
    tx,
    prisma,
    service: new MeetingReminderService(prisma as any),
  };
}

function createdRows(tx: ReturnType<typeof setup>['tx']) {
  return (tx.notification.createMany.mock.calls as unknown as Array<
    [{ data: Array<{ recipientId: string; [key: string]: any }> }]
  >)[0][0].data;
}

describe('MeetingReminderService', () => {
  it('creates due meeting reminders with a neutral body and structured UTC metadata', async () => {
    const { service, prisma, tx } = setup();

    await service.processDueReminders();

    expect(tx.meeting.findMany).toHaveBeenCalledWith({
      where: {
        status: MeetingStatus.SCHEDULED,
        reminderAt: { lte: expect.any(Date) },
        reminderSentAt: null,
        organization: { status: 'ACTIVE' },
      },
      include: {
        assignees: { select: { userId: true } },
        organization: { select: { timezone: true } },
      },
      take: 100,
      orderBy: { reminderAt: 'asc' },
    });

    const rows = createdRows(tx);
    expect(rows).toHaveLength(2);
    expect(prisma.installTenantContext).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ organizationId: 'organization-1' }),
    );
    expect(rows[0]).toEqual(
      expect.objectContaining({
        organizationId: 'organization-1',
        type: NotificationType.MEETING_REMINDER,
        body: 'جلسه «معرفی محصول» به‌زودی برگزار می‌شود.',
        entityType: NotificationEntityType.MEETING,
        entityId: 'meeting-1',
        actionUrl: '/meetings/meeting-1',
        metadata: {
          meetingTitle: 'معرفی محصول',
          meetingStartAt: startAt.toISOString(),
          meetingEndAt: endAt.toISOString(),
          reminderAt: reminderAt.toISOString(),
          organizationTimeZone: 'Europe/Berlin',
        },
      }),
    );
    expect(rows[0].body).not.toContain(startAt.toISOString());
    expect(rows.map((row) => row.recipientId)).toEqual([
      'user-1',
      'user-2',
    ]);
  });

  it.each([undefined, '', 'Not/A-Time-Zone'])(
    'uses Asia/Tehran when organization timezone is missing or invalid (%s)',
    async (timezone) => {
      const { service, tx } = setup([
        meeting({ organization: { timezone } }),
      ]);
      await service.processDueReminders();
      expect(
        createdRows(tx)[0].metadata,
      ).toEqual(
        expect.objectContaining({ organizationTimeZone: 'Asia/Tehran' }),
      );
    },
  );

  it('keeps notification creation and reminderSentAt update in one transaction and in order', async () => {
    const { service, prisma, tx, order } = setup();
    await service.processDueReminders();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['notification.createMany', 'meeting.update']);
    expect(tx.meeting.update).toHaveBeenCalledWith({
      where: { id: 'meeting-1' },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it('does not update reminderSentAt when notification creation fails', async () => {
    const { service, tx } = setup();
    tx.notification.createMany.mockRejectedValueOnce(new Error('write failed'));
    await service.processDueReminders();
    expect(tx.meeting.update).not.toHaveBeenCalled();
  });

  it('creates no notifications when no scheduled due meetings are returned', async () => {
    const { service, tx } = setup([]);
    await service.processDueReminders();
    expect(tx.notification.createMany).not.toHaveBeenCalled();
    expect(tx.meeting.update).not.toHaveBeenCalled();
  });

  it('keeps each notification and audit record in the meeting organization', async () => {
    const { service, tx } = setup();
    await service.processDueReminders();
    expect(createdRows(tx)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationId: 'organization-1' }),
      ]),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: 'organization-1' }),
    });
  });

  it('does nothing when another worker owns the advisory lock', async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ locked: false }]);
    await service.processDueReminders();
    expect(tx.meeting.findMany).not.toHaveBeenCalled();
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });
});
