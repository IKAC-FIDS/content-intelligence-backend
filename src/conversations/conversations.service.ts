import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConversationEntityType, ConversationMessageType, Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { getCurrentOrganizationId, tenantScope } from '../common/tenant/tenant-scope.util';
import { NotificationCoreService } from '../notification-core/notification-core.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationAccessService } from './conversation-access.service';
import { CreateConversationMessageDto, FindConversationDto, UpdateConversationMessageDto, UpdateConversationStatusDto } from './dto/conversation.dto';

const messageInclude = {
  author: { select: { id: true, fullName: true, avatarObjectKey: true } },
  parentMessage: { select: { id: true, body: true, type: true, author: { select: { id: true, fullName: true } } } },
} satisfies Prisma.ConversationMessageInclude;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConversationAccessService,
    private readonly notifications: NotificationCoreService,
    private readonly audit: AuditLogService,
  ) {}

  async find(entityType: ConversationEntityType, entityId: string, query: FindConversationDto, user: CurrentUserPayload) {
    this.assertEntityType(entityType);
    await this.access.assertReadable(entityType, entityId, user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const organizationId = getCurrentOrganizationId(user);
    return this.prisma.withTenantTransaction(tenantScope.require(user), async (tx) => {
      const thread = await tx.conversationThread.findUnique({
        where: { organizationId_entityType_entityId: { organizationId, entityType, entityId } },
        include: { participants: { where: { userId: user.userId }, select: { lastReadAt: true } } },
      });
      if (!thread) return { thread: null, messages: [], unreadCount: 0, meta: this.meta(0, page, limit) };
      const participant = thread.participants[0];
      const where = { threadId: thread.id, organizationId };
      const [messages, total, unreadCount] = await Promise.all([
        tx.conversationMessage.findMany({ where, include: messageInclude, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
        tx.conversationMessage.count({ where }),
        tx.conversationMessage.count({ where: { ...where, authorId: { not: user.userId }, deletedAt: null, ...(participant?.lastReadAt ? { createdAt: { gt: participant.lastReadAt } } : {}) } }),
      ]);
      return { thread: { id: thread.id, status: thread.status, createdById: thread.createdById, createdAt: thread.createdAt, updatedAt: thread.updatedAt }, messages: messages.map(this.presentMessage), unreadCount, meta: this.meta(total, page, limit) };
    });
  }

  async createMessage(entityType: ConversationEntityType, entityId: string, dto: CreateConversationMessageDto, user: CurrentUserPayload) {
    this.assertEntityType(entityType);
    const entity = await this.access.assertReadable(entityType, entityId, user);
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('متن پیام الزامی است.');
    if (dto.type === ConversationMessageType.ANSWER && !dto.parentMessageId) throw new BadRequestException('پاسخ باید به یک پیام مرتبط باشد.');
    const organizationId = getCurrentOrganizationId(user);
    const created = await this.prisma.withTenantTransaction(tenantScope.require(user), async (tx) => {
      const thread = await tx.conversationThread.upsert({
        where: { organizationId_entityType_entityId: { organizationId, entityType, entityId } },
        create: { organizationId, entityType, entityId, createdById: user.userId },
        update: {},
      });
      let parent: { id: string; authorId: string; parentMessageId: string | null } | null = null;
      if (dto.parentMessageId) {
        parent = await tx.conversationMessage.findFirst({ where: { id: dto.parentMessageId, threadId: thread.id, organizationId, deletedAt: null }, select: { id: true, authorId: true, parentMessageId: true } });
        if (!parent || parent.parentMessageId) throw new BadRequestException('پیام مرجع نامعتبر است.');
      }
      const message = await tx.conversationMessage.create({
        data: { organizationId, threadId: thread.id, authorId: user.userId, body, type: dto.parentMessageId ? ConversationMessageType.ANSWER : dto.type, parentMessageId: parent?.id },
        include: messageInclude,
      });
      const participantIds = [...new Set([user.userId, ...entity.responsibleUserIds, parent?.authorId].filter((id): id is string => Boolean(id)))];
      await Promise.all(participantIds.map((userId) => tx.conversationParticipant.upsert({ where: { threadId_userId: { threadId: thread.id, userId } }, create: { threadId: thread.id, userId, ...(userId === user.userId ? { lastReadAt: new Date() } : {}) }, update: userId === user.userId ? { lastReadAt: new Date() } : {} })));
      return { thread, message, participantIds };
    });
    await this.audit.record({ actorId: user.userId, organizationId, entityType: 'conversation-message', entityId: created.message.id, action: 'conversation.message_created', metadata: { threadId: created.thread.id, entityType, entityId, messageType: created.message.type } });
    const recipientIds = created.participantIds.filter((id) => id !== user.userId);
    const eventName = created.message.parentMessageId ? 'CONVERSATION.REPLY_CREATED' : dto.type === ConversationMessageType.QUESTION ? 'CONVERSATION.QUESTION_CREATED' : 'CONVERSATION.MESSAGE_CREATED';
    await this.notifications.publishDomainEvent({
      organizationId, eventName, aggregateType: entityType, aggregateId: entityId, actorId: user.userId,
      idempotencyKey: `conversation:${created.message.id}:created`,
      payload: { threadId: created.thread.id, messageId: created.message.id, entityType, entityId, messageType: created.message.type, parentMessageId: created.message.parentMessageId, assigneeUserIds: recipientIds, ownerUserId: recipientIds[0], creatorUserId: recipientIds[0], actionUrl: entity.actionUrl, entityLabel: entity.label },
    });
    return this.presentMessage(created.message);
  }

  async markRead(entityType: ConversationEntityType, entityId: string, user: CurrentUserPayload) {
    this.assertEntityType(entityType);
    await this.access.assertReadable(entityType, entityId, user);
    const organizationId = getCurrentOrganizationId(user);
    return this.prisma.withTenantTransaction(tenantScope.require(user), async (tx) => {
      const thread = await tx.conversationThread.findUnique({ where: { organizationId_entityType_entityId: { organizationId, entityType, entityId } }, select: { id: true } });
      if (!thread) return { unreadCount: 0, lastReadAt: null };
      const lastReadAt = new Date();
      await tx.conversationParticipant.upsert({ where: { threadId_userId: { threadId: thread.id, userId: user.userId } }, create: { threadId: thread.id, userId: user.userId, lastReadAt }, update: { lastReadAt } });
      return { unreadCount: 0, lastReadAt };
    });
  }

  async updateMessage(messageId: string, dto: UpdateConversationMessageDto, user: CurrentUserPayload) {
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('متن پیام الزامی است.');
    const current = await this.getMessageWithAccess(messageId, user);
    if (current.message.authorId !== user.userId && !this.canModerate(user)) throw new ForbiddenException('اجازه ویرایش این پیام را ندارید.');
    if (current.message.deletedAt) throw new BadRequestException('پیام حذف‌شده قابل ویرایش نیست.');
    const updated = await this.prisma.withTenantTransaction(tenantScope.require(user), (tx) => tx.conversationMessage.update({ where: { id: messageId }, data: { body, editedAt: new Date() }, include: messageInclude }));
    await this.audit.record({ actorId: user.userId, organizationId: current.message.organizationId, entityType: 'conversation-message', entityId: messageId, action: 'conversation.message_edited' });
    return this.presentMessage(updated);
  }

  async deleteMessage(messageId: string, user: CurrentUserPayload) {
    const current = await this.getMessageWithAccess(messageId, user);
    if (current.message.authorId !== user.userId && !this.canModerate(user)) throw new ForbiddenException('اجازه حذف این پیام را ندارید.');
    const deletedAt = new Date();
    await this.prisma.withTenantTransaction(tenantScope.require(user), (tx) => tx.conversationMessage.update({ where: { id: messageId }, data: { deletedAt, deletedById: user.userId } }));
    await this.audit.record({ actorId: user.userId, organizationId: current.message.organizationId, entityType: 'conversation-message', entityId: messageId, action: 'conversation.message_deleted' });
    return { id: messageId, deletedAt };
  }

  async updateStatus(threadId: string, dto: UpdateConversationStatusDto, user: CurrentUserPayload) {
    const { thread, entity } = await this.getThreadWithAccess(threadId, user);
    if (thread.createdById !== user.userId && !this.canModerate(user)) throw new ForbiddenException('اجازه تغییر وضعیت گفتگو را ندارید.');
    const updated = await this.prisma.withTenantTransaction(tenantScope.require(user), (tx) => tx.conversationThread.update({ where: { id: threadId }, data: { status: dto.status } }));
    await this.audit.record({ actorId: user.userId, organizationId: thread.organizationId, entityType: 'conversation-thread', entityId: threadId, action: `conversation.${dto.status.toLowerCase()}` });
    if (dto.status === 'RESOLVED') {
      const participantIds = await this.prisma.withTenantTransaction(tenantScope.require(user), (tx) => tx.conversationParticipant.findMany({ where: { threadId }, select: { userId: true } }));
      const recipientIds = [...new Set([...participantIds.map((item) => item.userId), ...entity.responsibleUserIds])].filter((id) => id !== user.userId);
      await this.notifications.publishDomainEvent({ organizationId: thread.organizationId, eventName: 'CONVERSATION.RESOLVED', aggregateType: thread.entityType, aggregateId: thread.entityId, actorId: user.userId, idempotencyKey: `conversation:${threadId}:resolved:${updated.updatedAt.toISOString()}`, payload: { threadId, entityType: thread.entityType, entityId: thread.entityId, entityLabel: entity.label, assigneeUserIds: recipientIds, actionUrl: entity.actionUrl } });
    }
    return { id: updated.id, status: updated.status, updatedAt: updated.updatedAt };
  }

  private async getMessageWithAccess(messageId: string, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    const message = await this.prisma.withTenantTransaction(tenantScope.require(user), (tx) => tx.conversationMessage.findFirst({ where: { id: messageId, organizationId }, include: { thread: true } }));
    if (!message) throw new NotFoundException('Message not found');
    await this.access.assertReadable(message.thread.entityType, message.thread.entityId, user);
    return { message };
  }

  private async getThreadWithAccess(threadId: string, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    const thread = await this.prisma.withTenantTransaction(tenantScope.require(user), (tx) => tx.conversationThread.findFirst({ where: { id: threadId, organizationId } }));
    if (!thread) throw new NotFoundException('Conversation not found');
    const entity = await this.access.assertReadable(thread.entityType, thread.entityId, user);
    return { thread, entity };
  }

  private canModerate(user: CurrentUserPayload) { return user.role === 'ADMIN' || user.role === 'MANAGER'; }
  private assertEntityType(value: ConversationEntityType) { if (!Object.values(ConversationEntityType).includes(value)) throw new BadRequestException('نوع موجودیت گفتگو نامعتبر است.'); }
  private presentMessage(message: any) { return { ...message, body: message.deletedAt ? null : message.body, deletedById: undefined }; }
  private meta(total: number, page: number, limit: number) { const totalPages = Math.ceil(total / limit); return { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 }; }
}
