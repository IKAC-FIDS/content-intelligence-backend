import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Notification,
  NotificationEntityType,
  NotificationPriority,
  NotificationType,
  OrganizationMembershipStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import {
  PrismaService,
  TenantTransactionClient,
} from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { FindNotificationsDto } from './dto/find-notifications.dto';
import { ReadAllNotificationsDto } from './dto/read-all-notifications.dto';
import {
  getCurrentOrganizationId,
  tenantScope,
} from '../common/tenant/tenant-scope.util';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import { userMatchesTeam } from '../common/tenant/team-scope.util';

const notificationInclude = {
  recipient: {
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      team: true,
    },
  },
  actor: {
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      team: true,
    },
  },
} satisfies Prisma.NotificationInclude;

export interface NotifyUserInput {
  recipientId: string;
  actorId?: string | null;
  organizationId: string;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  body?: string | null;
  entityType?: NotificationEntityType | null;
  entityId?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
  skipSelf?: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(query: FindNotificationsDto, user: CurrentUserPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query, user);

    const [data, total] = await this.withTenant(user, async (tx) => Promise.all([
      tx.notification.findMany({
        where,
        include: notificationInclude,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.notification.count({ where }),
    ]));

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async unreadCount(user: CurrentUserPayload) {
    const total = await this.withTenant(user, (tx) => tx.notification.count({
      where: {
        organizationId: getCurrentOrganizationId(user),
        recipientId: user.userId,
        readAt: null,
        archivedAt: null,
      },
    }));

    return {
      total,
    };
  }

  async findOne(id: string, user: CurrentUserPayload) {
    return this.withTenant(user, (tx) =>
      this.getNotificationInScope(tx, id, user),
    );
  }

  async create(dto: CreateNotificationDto, user: CurrentUserPayload) {
    if (user.role === UserRole.BOARDS) {
      throw new ForbiddenException('Notifications are read-only for this role');
    }

    const recipients = await this.validateRecipients(dto.recipientIds, user);

    const notifications = await this.withTenant(user, (tx) => Promise.all(
      recipients.map((recipient) =>
        tx.notification.create({
          data: {
            organizationId: getCurrentOrganizationId(user),
            recipientId: recipient.id,
            actorId: user.userId,
            type: dto.type,
            priority: dto.priority ?? NotificationPriority.NORMAL,
            title: this.requiredText(dto.title, 'عنوان اعلان الزامی است'),
            body: dto.body?.trim() || undefined,
            entityType: dto.entityType,
            entityId: dto.entityId?.trim() || undefined,
            actionUrl: dto.actionUrl?.trim() || undefined,
            metadata: dto.metadata,
          },
          include: notificationInclude,
        }),
      ),
    ));

    await this.audit.record({
      actorId: user.userId,
      entityType: 'notification',
      action: 'notification.created',
      after: notifications,
      metadata: {
        recipientCount: notifications.length,
        type: dto.type,
        entityType: dto.entityType,
        entityId: dto.entityId,
      },
    });

    return {
      data: notifications,
      meta: {
        total: notifications.length,
      },
    };
  }

  async markRead(id: string, user: CurrentUserPayload) {
    const { current, updated } = await this.withTenant(user, async (tx) => {
      const current = await this.getNotificationInScope(tx, id, user);
      if (current.readAt) return { current, updated: current };
      const updated = await tx.notification.update({
        where: { id }, data: { readAt: new Date() }, include: notificationInclude,
      });
      return { current, updated };
    });

    if (updated === current) return current;

    await this.audit.record({
      actorId: user.userId,
      entityType: 'notification',
      entityId: id,
      action: 'notification.read',
      before: {
        readAt: current.readAt,
      },
      after: {
        readAt: updated.readAt,
      },
    });

    return updated;
  }

  async markUnread(id: string, user: CurrentUserPayload) {
    const { current, updated } = await this.withTenant(user, async (tx) => {
      const current = await this.getNotificationInScope(tx, id, user);
      const updated = await tx.notification.update({
        where: { id }, data: { readAt: null }, include: notificationInclude,
      });
      return { current, updated };
    });

    await this.audit.record({
      actorId: user.userId,
      entityType: 'notification',
      entityId: id,
      action: 'notification.unread',
      before: {
        readAt: current.readAt,
      },
      after: {
        readAt: updated.readAt,
      },
    });

    return updated;
  }

  async readAll(dto: ReadAllNotificationsDto, user: CurrentUserPayload) {
    const where: Prisma.NotificationWhereInput = {
      organizationId: getCurrentOrganizationId(user),
      recipientId: user.userId,
      readAt: null,
      archivedAt: null,
      ...(dto.type && { type: dto.type }),
      ...(dto.entityType && { entityType: dto.entityType }),
      ...(dto.entityId && { entityId: dto.entityId }),
    };

    const result = await this.withTenant(user, (tx) => tx.notification.updateMany({
      where,
      data: {
        readAt: new Date(),
      },
    }));

    await this.audit.record({
      actorId: user.userId,
      entityType: 'notification',
      action: 'notification.read_all',
      metadata: {
        updatedCount: result.count,
        type: dto.type,
        entityType: dto.entityType,
        entityId: dto.entityId,
      },
    });

    return {
      updatedCount: result.count,
    };
  }

  async archive(id: string, user: CurrentUserPayload) {
    const { current, updated } = await this.withTenant(user, async (tx) => {
      const current = await this.getNotificationInScope(tx, id, user);
      const updated = await tx.notification.update({
        where: { id }, data: { archivedAt: new Date() }, include: notificationInclude,
      });
      return { current, updated };
    });

    await this.audit.record({
      actorId: user.userId,
      entityType: 'notification',
      entityId: id,
      action: 'notification.archived',
      before: {
        archivedAt: current.archivedAt,
      },
      after: {
        archivedAt: updated.archivedAt,
      },
    });

    return updated;
  }

  async unarchive(id: string, user: CurrentUserPayload) {
    const { current, updated } = await this.withTenant(user, async (tx) => {
      const current = await this.getNotificationInScope(tx, id, user);
      const updated = await tx.notification.update({
        where: { id }, data: { archivedAt: null }, include: notificationInclude,
      });
      return { current, updated };
    });

    await this.audit.record({
      actorId: user.userId,
      entityType: 'notification',
      entityId: id,
      action: 'notification.unarchived',
      before: {
        archivedAt: current.archivedAt,
      },
      after: {
        archivedAt: updated.archivedAt,
      },
    });

    return updated;
  }

  async remove(id: string, user: CurrentUserPayload) {
    const { current, deleted } = await this.withTenant(user, async (tx) => {
      const current = await this.getNotificationInScope(tx, id, user);
      const deleted = await tx.notification.delete({ where: { id } });
      return { current, deleted };
    });

    await this.audit.record({
      actorId: user.userId,
      entityType: 'notification',
      entityId: id,
      action: 'notification.deleted',
      before: current,
    });

    return deleted;
  }

  async notifyUser(input: NotifyUserInput): Promise<Notification | null> {
    if (input.skipSelf && input.actorId && input.actorId === input.recipientId) {
      return null;
    }

    const recipient = await this.prisma.user.findFirst({
      where: {
        id: input.recipientId,
        isActive: true,
        organizationMemberships: {
          some: { organizationId: input.organizationId, status: OrganizationMembershipStatus.ACTIVE },
        },
      },
      select: {
        id: true,
        isActive: true,
        organizationId: true,
      },
    });

    if (!recipient?.isActive) {
      return null;
    }

    return this.prisma.withTenantTransaction(
      this.contextForInternalNotification(input),
      (tx) => tx.notification.create({
      data: {
        organizationId: input.organizationId,
        recipientId: input.recipientId,
        actorId: input.actorId ?? undefined,
        type: input.type,
        priority: input.priority ?? NotificationPriority.NORMAL,
        title: this.requiredText(input.title, 'عنوان اعلان الزامی است'),
        body: input.body?.trim() || undefined,
        entityType: input.entityType ?? undefined,
        entityId: input.entityId ?? undefined,
        actionUrl: input.actionUrl ?? undefined,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
      }),
    );
  }

  /** Called inside the delivery transaction so inbox persistence and delivery completion commit together. */
  async createInternal(input: NotifyUserInput, tx: TenantTransactionClient) {
    const recipient = await tx.user.findFirst({ where: {
      id: input.recipientId, isActive: true,
      organizationMemberships: { some: { organizationId: input.organizationId, status: OrganizationMembershipStatus.ACTIVE } },
    }, select: { id: true } });
    if (!recipient) return null;
    const notification = await tx.notification.create({ data: {
      organizationId: input.organizationId, recipientId: input.recipientId,
      actorId: input.actorId, title: this.requiredText(input.title, 'عنوان اعلان الزامی است'),
      body: input.body, type: input.type, priority: input.priority,
      entityType: input.entityType, entityId: input.entityId, actionUrl: input.actionUrl,
      metadata: input.metadata as Prisma.InputJsonValue,
    } });
    await this.audit.record({ organizationId: input.organizationId, actorId: input.actorId,
      entityType: 'notification', entityId: notification.id, action: 'notification.created',
      metadata: { ...input.metadata, recipientId: input.recipientId, type: input.type },
    }, tx);
    return notification;
  }

  private buildWhere(
    query: FindNotificationsDto,
    user: CurrentUserPayload,
  ): Prisma.NotificationWhereInput {
    const and: Prisma.NotificationWhereInput[] = [
      {
        organizationId: getCurrentOrganizationId(user),
        recipientId: user.userId,
      },
    ];

    if (query.type) {
      and.push({
        type: query.type,
      });
    }

    if (query.priority) {
      and.push({
        priority: query.priority,
      });
    }

    if (query.entityType) {
      and.push({
        entityType: query.entityType,
      });
    }

    if (query.entityId?.trim()) {
      and.push({
        entityId: query.entityId.trim(),
      });
    }

    if (query.status === 'unread') {
      and.push({
        readAt: null,
      });
    }

    if (query.status === 'read') {
      and.push({
        readAt: {
          not: null,
        },
      });
    }

    if (query.archivedOnly === 'true') {
      and.push({
        archivedAt: {
          not: null,
        },
      });
    } else if (query.includeArchived !== 'true') {
      and.push({
        archivedAt: null,
      });
    }

    const search = query.search?.trim();

    if (search) {
      and.push({
        OR: [
          {
            title: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            body: {
              contains: search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    return {
      AND: and,
    };
  }

  private async getNotificationInScope(
    tx: TenantTransactionClient,
    id: string,
    user: CurrentUserPayload,
  ) {
    const notification = await tx.notification.findFirst({
      where: {
        id,
        organizationId: getCurrentOrganizationId(user),
        recipientId: user.userId,
      },
      include: notificationInclude,
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  private withTenant<T>(
    user: CurrentUserPayload,
    callback: (tx: TenantTransactionClient) => Promise<T>,
  ) {
    return this.prisma.withTenantTransaction(tenantScope.require(user), callback);
  }

  private contextForInternalNotification(input: NotifyUserInput): TenantContext {
    return {
      tenantId: input.organizationId,
      organizationId: input.organizationId,
      userId: input.actorId ?? input.recipientId,
      membershipId: `internal-notification:${input.recipientId}`,
      tenantRole: 'SYSTEM',
      permissions: [],
      platformAdmin: false,
      membershipStatus: 'active' as const,
      resolutionSource: 'authenticated-membership' as const,
    };
  }

  private async validateRecipients(
    recipientIds: string[],
    user: CurrentUserPayload,
  ) {
    const uniqueIds = Array.from(new Set(recipientIds));

    if (!uniqueIds.length) {
      throw new BadRequestException('حداقل یک گیرنده اعلان الزامی است');
    }

    const recipients = await this.prisma.user.findMany({
      where: {
        id: {
          in: uniqueIds,
        },
        isActive: true,
        organizationMemberships: {
          some: {
            organizationId: getCurrentOrganizationId(user),
            status: OrganizationMembershipStatus.ACTIVE,
          },
        },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        team: true,
        teamId: true,
        isActive: true,
        organizationId: true,
      },
    });

    if (recipients.length !== uniqueIds.length) {
      throw new BadRequestException('یک یا چند گیرنده اعلان معتبر نیستند');
    }

    if (user.role === UserRole.ADMIN) {
      return recipients;
    }

    if (user.role === UserRole.MANAGER) {
      const invalidRecipient = recipients.find(
        (recipient) => !userMatchesTeam(recipient, user),
      );

      if (invalidRecipient) {
        throw new ForbiddenException(
          'MANAGER can only send notifications to own team',
        );
      }

      return recipients;
    }

    const invalidRecipient = recipients.find(
      (recipient) => recipient.id !== user.userId,
    );

    if (invalidRecipient) {
      throw new ForbiddenException('REP can only send notifications to self');
    }

    return recipients;
  }

  private requiredText(value: string, message: string) {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }
}
