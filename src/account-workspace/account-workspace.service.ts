import { Injectable } from "@nestjs/common";
import { ConversationEntityType, TaskStatus } from "@prisma/client";
import { canViewFinancials } from "../common/financial/financial-visibility";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { parseApiDateRange } from "../common/dates/api-date.util";
import { organizationDayBounds } from "../common/dates/timezone-boundary.util";
import { tenantScope } from "../common/tenant/tenant-scope.util";
import { PrismaService } from "../prisma/prisma.service";
import { AccountWorkspaceQueryDto } from "./dto/account-workspace-query.dto";

@Injectable()
export class AccountWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkspace(
    query: AccountWorkspaceQueryDto,
    user: CurrentUserPayload,
  ) {
    const tenant = tenantScope.require(user);
    const financialVisible = canViewFinancials(user);
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 30 * 86_400_000);
    const requestedRange = parseApiDateRange(query.startDate, query.endDate);
    const period = requestedRange ?? { gte: defaultStart, lte: now };

    return this.prisma.withTenantTransaction(tenant, async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: tenant.organizationId },
        select: { timezone: true },
      });
      const { start: todayStart, end: tomorrowStart } = organizationDayBounds(
        now,
        organization?.timezone || "Asia/Tehran",
      );
      const limit = query.recentLimit;
      const openTaskStatus = { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] };

      const [
        taskCounts,
        overdueTasks,
        todayTasks,
        recentTasks,
        opportunityRows,
        recentOpportunities,
        companyCount,
        recentCompanies,
        upcomingMeetingCount,
        upcomingMeetings,
        activityTypes,
        activityCounts,
        unreadNotifications,
        recentNotifications,
        participants,
      ] = await Promise.all([
        tx.task.groupBy({
          by: ["status"],
          where: {
            organizationId: tenant.organizationId,
            assignedToId: user.userId,
          },
          _count: { id: true },
        }),
        tx.task.count({
          where: {
            organizationId: tenant.organizationId,
            assignedToId: user.userId,
            status: openTaskStatus,
            dueAt: { lt: todayStart },
          },
        }),
        tx.task.count({
          where: {
            organizationId: tenant.organizationId,
            assignedToId: user.userId,
            status: openTaskStatus,
            dueAt: { gte: todayStart, lt: tomorrowStart },
          },
        }),
        tx.task.findMany({
          where: {
            organizationId: tenant.organizationId,
            assignedToId: user.userId,
            status: openTaskStatus,
          },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueAt: true,
            company: {
              select: {
                id: true,
                legalName: true,
                brandName: true,
                logoObjectKey: true,
              },
            },
          },
          orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
          take: limit,
        }),
        tx.opportunity.findMany({
          where: {
            organizationId: tenant.organizationId,
            ownerId: user.userId,
            archivedAt: null,
          },
          select: {
            estimatedValue: true,
            stage: { select: { terminalType: true } },
          },
        }),
        tx.opportunity.findMany({
          where: {
            organizationId: tenant.organizationId,
            ownerId: user.userId,
            archivedAt: null,
          },
          select: {
            id: true,
            title: true,
            estimatedValue: true,
            expectedCloseDate: true,
            priority: true,
            stage: {
              select: {
                id: true,
                label: true,
                terminalType: true,
                isTerminal: true,
              },
            },
            company: {
              select: {
                id: true,
                legalName: true,
                brandName: true,
                logoObjectKey: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: limit,
        }),
        tx.company.count({
          where: {
            organizationId: tenant.organizationId,
            ownerId: user.userId,
            archivedAt: null,
          },
        }),
        tx.company.findMany({
          where: {
            organizationId: tenant.organizationId,
            ownerId: user.userId,
            archivedAt: null,
          },
          select: {
            id: true,
            legalName: true,
            brandName: true,
            logoObjectKey: true,
            stage: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: limit,
        }),
        tx.meeting.count({
          where: {
            organizationId: tenant.organizationId,
            status: "SCHEDULED",
            startAt: { gte: now },
            OR: [
              { organizerId: user.userId },
              { assignees: { some: { userId: user.userId } } },
            ],
          },
        }),
        tx.meeting.findMany({
          where: {
            organizationId: tenant.organizationId,
            status: "SCHEDULED",
            startAt: { gte: now },
            OR: [
              { organizerId: user.userId },
              { assignees: { some: { userId: user.userId } } },
            ],
          },
          select: {
            id: true,
            title: true,
            startAt: true,
            endAt: true,
            mode: true,
            company: {
              select: {
                id: true,
                legalName: true,
                brandName: true,
                logoObjectKey: true,
              },
            },
          },
          orderBy: { startAt: "asc" },
          take: limit,
        }),
        tx.lookupOption.findMany({
          where: {
            group: "activity-types",
            isActive: true,
          },
          select: { code: true, label: true, sortOrder: true },
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        }),
        tx.activity.groupBy({
          by: ["type"],
          where: {
            userId: user.userId,
            user: { organizationId: tenant.organizationId },
            type: { not: "STAGE_CHANGE" },
            occurredAt: period,
          },
          _count: { id: true },
        }),
        tx.notification.count({
          where: {
            organizationId: tenant.organizationId,
            recipientId: user.userId,
            readAt: null,
            archivedAt: null,
          },
        }),
        tx.notification.findMany({
          where: {
            organizationId: tenant.organizationId,
            recipientId: user.userId,
            archivedAt: null,
          },
          select: {
            id: true,
            title: true,
            body: true,
            priority: true,
            actionUrl: true,
            readAt: true,
            createdAt: true,
            actor: {
              select: { id: true, fullName: true, avatarObjectKey: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        }),
        tx.conversationParticipant.findMany({
          where: {
            userId: user.userId,
            thread: { organizationId: tenant.organizationId },
          },
          select: {
            lastReadAt: true,
            thread: {
              select: {
                id: true,
                entityType: true,
                entityId: true,
                status: true,
                updatedAt: true,
                messages: {
                  where: { deletedAt: null },
                  select: {
                    id: true,
                    body: true,
                    type: true,
                    createdAt: true,
                    author: {
                      select: {
                        id: true,
                        fullName: true,
                        avatarObjectKey: true,
                      },
                    },
                  },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
              },
            },
          },
          orderBy: { thread: { updatedAt: "desc" } },
        }),
      ]);

      const conversations = await Promise.all(
        participants.map(async (participant) => {
          const unreadCount = await tx.conversationMessage.count({
            where: {
              threadId: participant.thread.id,
              organizationId: tenant.organizationId,
              authorId: { not: user.userId },
              deletedAt: null,
              ...(participant.lastReadAt
                ? { createdAt: { gt: participant.lastReadAt } }
                : {}),
            },
          });
          return {
            id: participant.thread.id,
            entityType: participant.thread.entityType,
            entityId: participant.thread.entityId,
            status: participant.thread.status,
            updatedAt: participant.thread.updatedAt,
            unreadCount,
            actionUrl: this.conversationUrl(
              participant.thread.entityType,
              participant.thread.entityId,
            ),
            latestMessage: participant.thread.messages[0] ?? null,
          };
        }),
      );

      const activityByType = new Map(
        activityCounts.map((item) => [item.type, item._count.id]),
      );
      const activityBreakdown = activityTypes.map((item) => ({
        code: item.code,
        label: item.label,
        count: activityByType.get(item.code) ?? 0,
      }));
      const activityTotal = activityBreakdown.reduce(
        (sum, item) => sum + item.count,
        0,
      );
      const taskCount = (status: TaskStatus) =>
        taskCounts.find((item) => item.status === status)?._count.id ?? 0;
      const classifyOpportunity = (terminalType: string | null) =>
        terminalType === "WON"
          ? "won"
          : terminalType === "LOST"
            ? "lost"
            : "active";
      const opportunitySummary = (kind: "active" | "won" | "lost") =>
        opportunityRows.filter(
          (item) => classifyOpportunity(item.stage.terminalType) === kind,
        );
      const valueOf = (items: typeof opportunityRows) =>
        financialVisible
          ? items.reduce(
              (sum, item) => sum + Number(item.estimatedValue ?? 0),
              0,
            )
          : null;

      return {
        period: {
          startDate: period.gte?.toISOString() ?? null,
          endDate: (period.lte ?? period.lt)?.toISOString() ?? null,
          defaultedToLast30Days: !requestedRange,
        },
        financialVisible,
        attention: {
          overdueTasks,
          dueTodayTasks: todayTasks,
          upcomingMeetings: upcomingMeetingCount,
          unreadNotifications,
          unreadConversationMessages: conversations.reduce(
            (sum, item) => sum + item.unreadCount,
            0,
          ),
        },
        summary: {
          tasks: {
            total: taskCounts.reduce((sum, item) => sum + item._count.id, 0),
            open:
              taskCount(TaskStatus.TODO) + taskCount(TaskStatus.IN_PROGRESS),
            completed: taskCount(TaskStatus.DONE),
            overdue: overdueTasks,
          },
          opportunities: {
            total: opportunityRows.length,
            active: opportunitySummary("active").length,
            won: opportunitySummary("won").length,
            lost: opportunitySummary("lost").length,
            totalValue: valueOf(opportunityRows),
            activeValue: valueOf(opportunitySummary("active")),
            wonValue: valueOf(opportunitySummary("won")),
            lostValue: valueOf(opportunitySummary("lost")),
          },
          companiesOwned: companyCount,
          activities: activityTotal,
          upcomingMeetings: upcomingMeetingCount,
          unreadNotifications,
        },
        activityBreakdown,
        recent: {
          tasks: recentTasks,
          opportunities: recentOpportunities.map((item) => ({
            ...item,
            estimatedValue: financialVisible
              ? Number(item.estimatedValue ?? 0)
              : null,
          })),
          companies: recentCompanies,
          meetings: upcomingMeetings,
          notifications: recentNotifications,
          conversations: conversations.slice(0, limit),
        },
      };
    });
  }

  private conversationUrl(
    entityType: ConversationEntityType,
    entityId: string,
  ) {
    if (entityType === ConversationEntityType.COMPANY)
      return `/companies/${entityId}#conversation`;
    if (entityType === ConversationEntityType.TASK)
      return `/tasks/${entityId}#conversation`;
    return `/activities?activityId=${encodeURIComponent(entityId)}&conversation=1`;
  }
}
