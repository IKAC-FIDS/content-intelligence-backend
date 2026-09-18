import { NotificationDeliveryStatus as Status, UserRole } from '@prisma/client';
import { InAppNotificationChannelHandler } from '../src/notification-core/in-app/in-app-notification-channel.handler';
import { NotificationActionUrlResolver, InAppNotificationMetadataMapper } from '../src/notification-core/in-app/notification-action-url.resolver';
import { NotificationTemplateEngineService } from '../src/notification-core/notification-template-engine.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { tenantUser } from './helpers/tenant-user';

function setup() {
  let delivery: any = { id: 'delivery-1', eventId: 'event-1', channel: 'IN_APP', status: Status.PENDING, recipientUserId: 'user-1', attemptCount: 0,
    deduplicationKey: 'event-rule-recipient',
    event: { id: 'event-1', organizationId: 'org-a', eventName: 'TASK.ASSIGNED', aggregateType: 'TASK', aggregateId: 'task-1', actorId: 'actor-1' },
    template: { id: 'template-1', organizationId: 'org-a', channel: 'IN_APP', eventName: 'TASK.ASSIGNED', subject: 'کار برای {{user.fullName}}', body: '{{task.title}}', isActive: true },
  };
  let inbox: any[] = [];
  let failCompletion = false;
  const matches = (where: any) => (!where.event?.organizationId || where.event.organizationId === delivery.event.organizationId)
    && (!where.status?.in || where.status.in.includes(delivery.status));
  const tx: any = {
    notificationDelivery: {
      updateMany: jest.fn(async ({ where, data }) => { if (!matches(where)) return { count: 0 }; delivery = { ...delivery, ...data, attemptCount: delivery.attemptCount + (data.attemptCount?.increment ?? 0) }; return { count: 1 }; }),
      findFirst: jest.fn(async ({ where }) => matches(where) ? delivery : null),
      update: jest.fn(async ({ data }) => { if (failCompletion && data.status === Status.DELIVERED) throw new Error('completion write failed'); delivery = { ...delivery, ...data }; return delivery; }),
    },
    organization: { findUnique: jest.fn(async () => ({ id: 'org-a', name: 'سازمان', locale: 'fa-IR' })) },
    user: { findFirst: jest.fn(async ({ where }) => where.organizationMemberships.some.organizationId === 'org-a' ? { id: where.id, fullName: 'علی', email: 'ali@example.com' } : null) },
    task: { findFirst: jest.fn(async () => ({ id: 'task-1', title: 'پیگیری قرارداد', dueAt: null })) },
    notification: {
      create: jest.fn(async ({ data }) => { const row = { id: 'notification-1', readAt: null, archivedAt: null, ...data }; inbox.push(row); return row; }),
      findFirst: jest.fn(async ({ where }) => inbox.find(row => row.id === where.id && row.organizationId === where.organizationId && row.recipientId === where.recipientId)),
      update: jest.fn(async ({ where, data }) => { const row = inbox.find(item => item.id === where.id); Object.assign(row, data); return row; }),
      count: jest.fn(async ({ where }) => inbox.filter(row => row.organizationId === where.organizationId && row.recipientId === where.recipientId && row.readAt === null && row.archivedAt === null).length),
    },
  };
  let tail = Promise.resolve();
  const prisma: any = { ...tx, withTenantTransaction: jest.fn((context, callback) => {
    const run = tail.then(async () => {
      const snapshot = structuredClone({ delivery, inbox });
      try { return await callback(tx); }
      catch (error) { delivery = snapshot.delivery; inbox = snapshot.inbox; throw error; }
    });
    tail = run.then(() => undefined, () => undefined);
    return run;
  }) };
  const notifications = new NotificationsService(prisma, { record: jest.fn() } as any);
  const templates = new NotificationTemplateEngineService(prisma);
  const handler = new InAppNotificationChannelHandler(prisma, templates, notifications, new NotificationActionUrlResolver(), new InAppNotificationMetadataMapper());
  return { handler, prisma, tx, notifications, delivery: () => delivery, inbox: () => inbox, failCompletion: (value: boolean) => { failCompletion = value; } };
}

describe('IN_APP integration with existing inbox', () => {
  it('renders into an unread existing Notification and records its ID as DELIVERED', async () => {
    const f = setup();
    expect(await f.handler.dispatch('delivery-1', 'org-a')).toMatchObject({ status: Status.DELIVERED, sent: true });
    expect(f.inbox()).toEqual([expect.objectContaining({ recipientId: 'user-1', organizationId: 'org-a', title: 'کار برای علی', body: 'پیگیری قرارداد', actionUrl: '/tasks/task-1', readAt: null, archivedAt: null,
      metadata: expect.objectContaining({ deliveryId: 'delivery-1', eventId: 'event-1' }) })]);
    expect(f.delivery()).toMatchObject({ providerMessageId: 'notification-1', sentAt: expect.any(Date), deliveredAt: expect.any(Date) });
    expect(f.prisma.withTenantTransaction).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org-a', platformAdmin: false }), expect.any(Function), expect.any(Object));
  });

  it('deduplicates repeated and concurrent dispatches', async () => {
    const f = setup();
    await Promise.all([f.handler.dispatch('delivery-1', 'org-a'), f.handler.dispatch('delivery-1', 'org-a')]);
    await f.handler.dispatch('delivery-1', 'org-a');
    expect(f.inbox()).toHaveLength(1);
    expect(f.tx.notification.create).toHaveBeenCalledTimes(1);
  });

  it('rolls back inbox insertion when delivery completion fails, then retries without duplication', async () => {
    const f = setup(); f.failCompletion(true);
    expect(await f.handler.dispatch('delivery-1', 'org-a')).toMatchObject({ status: Status.FAILED });
    expect(f.inbox()).toHaveLength(0);
    expect(f.delivery().status).not.toBe(Status.PROCESSING);
    f.failCompletion(false);
    await f.handler.dispatch('delivery-1', 'org-a');
    expect(f.inbox()).toHaveLength(1);
    expect(f.delivery().status).toBe(Status.DELIVERED);
  });

  it('preserves delivered state across read, unread, archive and unarchive with the existing service', async () => {
    const f = setup(); await f.handler.dispatch('delivery-1', 'org-a');
    const user = tenantUser({ userId: 'user-1', organizationId: 'org-a', email: 'ali@example.com', role: UserRole.ADMIN });
    expect(await f.notifications.unreadCount(user)).toEqual({ total: 1 });
    await f.notifications.markRead('notification-1', user);
    expect(await f.notifications.unreadCount(user)).toEqual({ total: 0 });
    await f.notifications.markUnread('notification-1', user);
    await f.notifications.archive('notification-1', user);
    expect(await f.notifications.unreadCount(user)).toEqual({ total: 0 });
    await f.notifications.unarchive('notification-1', user);
    expect(await f.notifications.unreadCount(user)).toEqual({ total: 1 });
    expect(f.delivery().status).toBe(Status.DELIVERED);
  });

  it.each(['missing', 'inactive', 'cross-tenant'])('skips %s recipients', async () => {
    const f = setup(); f.tx.user.findFirst.mockResolvedValue(null);
    expect(await f.handler.dispatch('delivery-1', 'org-a')).toMatchObject({ status: Status.SKIPPED, reason: 'RECIPIENT_NOT_FOUND' });
    expect(f.tx.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ isActive: true, organizationMemberships: { some: { organizationId: 'org-a', status: 'ACTIVE' } } }) }));
    expect(f.inbox()).toHaveLength(0);
  });

  it.each(['missing', 'inactive', 'wrong-organization', 'wrong-channel'])('rejects a %s template', async kind => {
    const f = setup();
    if (kind === 'missing') f.delivery().template = null;
    if (kind === 'inactive') f.delivery().template.isActive = false;
    if (kind === 'wrong-organization') f.delivery().template.organizationId = 'org-b';
    if (kind === 'wrong-channel') f.delivery().template.channel = 'SMS';
    expect(await f.handler.dispatch('delivery-1', 'org-a')).toMatchObject({ status: Status.SKIPPED, reason: 'IN_APP_TEMPLATE_NOT_FOUND' });
    expect(f.inbox()).toHaveLength(0);
  });

  it('does not claim another organization delivery', async () => {
    const f = setup(); await f.handler.dispatch('delivery-1', 'org-b');
    expect(f.delivery().status).toBe(Status.PENDING);
    expect(f.inbox()).toHaveLength(0);
  });

  it('rejects missing subject or missing variables', async () => {
    const f = setup(); f.delivery().template.subject = '';
    expect(await f.handler.dispatch('delivery-1', 'org-a')).toMatchObject({ reason: 'INVALID_TEMPLATE_CONTEXT' });
  });
});

describe('notification action routes', () => {
  const resolver = new NotificationActionUrlResolver();
  it.each(['TASK.ASSIGNED', 'TASK.REASSIGNED', 'TASK.COMPLETED'])('routes %s', eventName => {
    expect(resolver.resolve({ eventName, aggregateType: 'TASK', aggregateId: 'task-1' })).toBe('/tasks/task-1');
  });
  it.each(['MEETING.CREATED', 'MEETING.UPDATED', 'MEETING.CANCELLED'])('routes %s', eventName => {
    expect(resolver.resolve({ eventName, aggregateType: 'MEETING', aggregateId: 'meeting-1' })).toBe('/meetings/meeting-1');
  });
  it.each(['https://evil.example', 'http://evil.example', 'javascript:alert(1)', 'data:text/html,test', '//evil.example', '../bad', '%2f%2fevil', '\\evil'])('rejects unsafe aggregate ID %s', aggregateId => {
    expect(resolver.resolve({ eventName: 'TASK.ASSIGNED', aggregateType: 'TASK', aggregateId })).toBeNull();
  });
});
