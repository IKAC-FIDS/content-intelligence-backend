import { BadRequestException } from '@nestjs/common';
import { MeetingMode, UserRole } from '@prisma/client';
import { MeetingsService } from '../src/meetings/meetings.service';
import { MeetingsController } from '../src/meetings/meetings.controller';
import { PERMISSIONS_KEY } from '../src/common/decorators/permissions.decorator';
import { tenantUser } from './helpers/tenant-user';

const organizationId = '00000000-0000-4000-8000-000000000001';
const user = tenantUser({ userId: 'user-1', email: 'a@example.com', role: UserRole.ADMIN, organizationId });
const base = { companyId: '00000000-0000-4000-8000-000000000010', title: 'Review', mode: MeetingMode.ONLINE, startAt: '2099-01-01T10:00:00.000Z', endAt: '2099-01-01T11:00:00.000Z' };

function setup() {
  const prisma = { lookupOption: { findFirst: jest.fn().mockResolvedValue({ id: 'meeting-type-other' }) }, company: { findFirst: jest.fn().mockResolvedValue({ id: base.companyId }) }, opportunity: { findFirst: jest.fn() }, user: { count: jest.fn() }, person: { count: jest.fn() }, meeting: { create: jest.fn().mockResolvedValue({ id: 'meeting-1' }) }, $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)) };
  return { prisma, service: new MeetingsService(prisma as any, { record: jest.fn() } as any, {} as any, { publishDomainEvent: jest.fn() } as any) };
}

describe('MeetingsService', () => {
  it('creates an organization-scoped company meeting transactionally', async () => {
    const { prisma, service } = setup(); await service.create(base, user);
    expect(prisma.$transaction).toHaveBeenCalled(); expect(prisma.meeting.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId, companyId: base.companyId, organizerId: user.userId }) }));
  });
  it('rejects endAt before startAt', async () => { const { service } = setup(); await expect(service.create({ ...base, endAt: '2099-01-01T09:00:00.000Z' }, user)).rejects.toThrow(new BadRequestException('endAt must be after startAt')); });
  it('rejects reminderAt after startAt', async () => { const { service } = setup(); await expect(service.create({ ...base, reminderAt: '2099-01-01T10:30:00.000Z' }, user)).rejects.toThrow(new BadRequestException('reminderAt must be before startAt')); });
  it('rejects an opportunity from another company', async () => { const { prisma, service } = setup(); prisma.opportunity.findFirst.mockResolvedValue({ companyId: 'other' }); await expect(service.create({ ...base, opportunityId: '00000000-0000-4000-8000-000000000020' }, user)).rejects.toThrow('Opportunity must belong to the meeting company'); });
  it('rejects an attendee outside the company', async () => { const { prisma, service } = setup(); prisma.person.count.mockResolvedValue(0); await expect(service.create({ ...base, attendeePersonIds: ['00000000-0000-4000-8000-000000000030'] }, user)).rejects.toThrow('One or more attendees do not belong to the meeting company'); });
});

describe('MeetingsService manual assignee email notification', () => {
  const meeting = {
    id: 'meeting-1',
    organizationId,
    title: 'جلسه بررسی فنی',
    status: 'SCHEDULED',
    startAt: new Date('2099-01-01T10:00:00.000Z'),
    endAt: new Date('2099-01-01T11:00:00.000Z'),
    mode: 'ONLINE',
    location: null,
    meetingUrl: 'https://meet.example.com/review',
    agenda: 'بررسی نیازمندی‌ها',
    description: 'توضیحات جلسه',
    company: { legalName: 'شرکت نمونه', brandName: null },
    assignees: [
      { user: { id: 'user-2', fullName: 'کاربر دوم', email: 'two@example.com' } },
      { user: { id: 'user-3', fullName: 'کاربر سوم', email: 'three@example.com' } },
    ],
  };

  function notificationSetup() {
    const prisma = {
      meeting: { findFirst: jest.fn().mockResolvedValue(meeting) },
      organization: { findUnique: jest.fn().mockResolvedValue({ locale: 'fa-IR', timezone: 'Asia/Tehran' }) },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const email = {
      assertConfigured: jest.fn().mockResolvedValue({}),
      send: jest.fn().mockResolvedValue({ messageId: 'message-1' }),
    };
    return { prisma, audit, email, service: new MeetingsService(prisma as any, audit as any, email as any, { publishDomainEvent: jest.fn() } as any) };
  }

  it('protects the endpoint with meeting:update', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, MeetingsController.prototype.notifyAssignees)).toEqual({
      actions: ['meeting:update'],
      mode: 'all',
    });
  });

  it('returns the normal not-found error for a missing meeting', async () => {
    const { prisma, service } = notificationSetup();
    prisma.meeting.findFirst.mockResolvedValue(null);
    await expect(service.notifyAssignees('missing', user)).rejects.toThrow('Meeting not found');
  });

  it('sends separate messages to every valid assignee with meeting template fields', async () => {
    const { email, service } = notificationSetup();
    const result = await service.notifyAssignees(meeting.id, user);

    expect(email.send).toHaveBeenCalledTimes(2);
    expect(email.send.mock.calls[0][1].to).toBe('two@example.com');
    expect(email.send.mock.calls[1][1].to).toBe('three@example.com');
    expect(email.send.mock.calls[0][1]).toEqual(expect.objectContaining({
      subject: expect.stringContaining(meeting.title),
      text: expect.stringContaining('شرکت نمونه'),
      html: expect.stringContaining(meeting.meetingUrl),
    }));
    expect(result).toEqual(expect.objectContaining({ total: 2, sent: 2, skipped: 0, failed: 0 }));
  });

  it('skips missing email and continues after an individual SMTP failure', async () => {
    const { prisma, email, service } = notificationSetup();
    prisma.meeting.findFirst.mockResolvedValue({
      ...meeting,
      assignees: [
        { user: { id: 'user-2', fullName: 'بدون ایمیل', email: null } },
        { user: { id: 'user-3', fullName: 'ناموفق', email: 'failed@example.com' } },
        { user: { id: 'user-4', fullName: 'موفق', email: 'sent@example.com' } },
      ],
    });
    email.send
      .mockRejectedValueOnce(new Error('SMTP secret detail'))
      .mockResolvedValueOnce({ messageId: 'message-2' });

    const result = await service.notifyAssignees(meeting.id, user);

    expect(email.send).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({ total: 3, sent: 1, skipped: 1, failed: 1 }));
    expect(result.recipients).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'user-2', status: 'SKIPPED', reason: 'NO_EMAIL' }),
      expect.objectContaining({ userId: 'user-3', status: 'FAILED', reason: 'SEND_FAILED' }),
      expect.objectContaining({ userId: 'user-4', status: 'SENT' }),
    ]));
    expect(JSON.stringify(result)).not.toContain('SMTP secret detail');
  });
});
