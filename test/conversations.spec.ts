import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConversationEntityType } from '@prisma/client';
import { ConversationAccessService } from '../src/conversations/conversation-access.service';
import { NotificationRulesService } from '../src/notification-core/notification-rules.service';

describe('Conversation architecture', () => {
  const companies = { assertCompanyReadable: jest.fn() };
  const tasks = { assertReadable: jest.fn() };
  const activities = { assertReadable: jest.fn() };
  const service = new ConversationAccessService(companies as never, tasks as never, activities as never);
  const user = { userId: 'user-1' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('inherits Company access and resolves its responsible owner', async () => {
    companies.assertCompanyReadable.mockResolvedValue({ id: 'company-1', legalName: 'شرکت', brandName: null, ownerId: 'owner-1' });
    await expect(service.assertReadable(ConversationEntityType.COMPANY, 'company-1', user)).resolves.toEqual(expect.objectContaining({ responsibleUserIds: ['owner-1'] }));
    expect(companies.assertCompanyReadable).toHaveBeenCalledWith('company-1', user);
  });

  it('inherits Task access and resolves assignee and reviewer', async () => {
    tasks.assertReadable.mockResolvedValue({ id: 'task-1', title: 'کار', assignedToId: 'user-2', reviewerId: 'user-3' });
    await expect(service.assertReadable(ConversationEntityType.TASK, 'task-1', user)).resolves.toEqual(expect.objectContaining({ responsibleUserIds: ['user-2', 'user-3'] }));
  });

  it('inherits Activity access and resolves the activity user', async () => {
    activities.assertReadable.mockResolvedValue({ id: 'activity-1', type: 'CALL', outcome: null, notes: null, userId: 'user-4' });
    await expect(service.assertReadable(ConversationEntityType.ACTIVITY, 'activity-1', user)).resolves.toEqual(expect.objectContaining({ responsibleUserIds: ['user-4'] }));
  });

  it('defines additive uniqueness, indexes and fail-closed RLS policies', () => {
    const sql = readFileSync(join(process.cwd(), 'prisma/migrations/20260917120000_conversations/migration.sql'), 'utf8');
    expect(sql).toContain('conversation_threads_organizationId_entityType_entityId_key');
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(3);
    expect(sql.match(/FORCE ROW LEVEL SECURITY/g)).toHaveLength(3);
    expect(sql).toContain("current_setting('app.current_organization_id', true)");
    expect(sql).not.toContain('SECURITY DEFINER');
  });

  it('exposes every conversation event to the notification rule editor', () => {
    const rules = new NotificationRulesService({} as never, {} as never, {} as never);
    expect(rules.catalog().events).toEqual(expect.arrayContaining([
      'CONVERSATION.MESSAGE_CREATED',
      'CONVERSATION.QUESTION_CREATED',
      'CONVERSATION.REPLY_CREATED',
      'CONVERSATION.RESOLVED',
    ]));
  });
});
