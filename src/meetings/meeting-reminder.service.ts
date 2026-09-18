import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MeetingStatus, NotificationEntityType, NotificationType, OrganizationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_ORGANIZATION_TIME_ZONE = 'Asia/Tehran';

interface MeetingReminderMetadata {
  meetingTitle: string;
  meetingStartAt: string;
  meetingEndAt: string;
  reminderAt: string | null;
  organizationTimeZone: string;
}

@Injectable()
export class MeetingReminderService {
  private readonly logger = new Logger(MeetingReminderService.name);
  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 * * * * *')
  async processDueReminders() {
    try {
      await this.prisma.$transaction(async tx => {
        const locked = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`SELECT pg_try_advisory_xact_lock(73644291) AS locked`);
        if (!locked[0]?.locked) return;
        const due = await tx.meeting.findMany({
          where: {
            status: MeetingStatus.SCHEDULED,
            reminderAt: { lte: new Date() },
            reminderSentAt: null,
            organization: { status: OrganizationStatus.ACTIVE },
          },
          include: {
            assignees: { select: { userId: true } },
            organization: { select: { timezone: true } },
          },
          take: 100,
          orderBy: { reminderAt: 'asc' },
        });
        for (const meeting of due) {
          await this.prisma.installTenantContext(tx, {
            tenantId: meeting.organizationId,
            organizationId: meeting.organizationId,
            userId: meeting.organizerId,
            membershipId: `meeting-reminder:${meeting.id}`,
            tenantRole: 'SYSTEM',
            permissions: [],
            platformAdmin: false,
            membershipStatus: 'active',
            resolutionSource: 'authenticated-membership',
          });
          const recipientIds = [...new Set([meeting.organizerId, ...meeting.assignees.map(a => a.userId)])];
          const metadata: MeetingReminderMetadata = {
            meetingTitle: meeting.title,
            meetingStartAt: meeting.startAt.toISOString(),
            meetingEndAt: meeting.endAt.toISOString(),
            reminderAt: meeting.reminderAt?.toISOString() ?? null,
            organizationTimeZone: this.organizationTimeZone(
              meeting.organization.timezone,
            ),
          };
          await tx.notification.createMany({
            data: recipientIds.map(recipientId => ({
              organizationId: meeting.organizationId,
              recipientId,
              type: NotificationType.MEETING_REMINDER,
              title: 'یادآوری جلسه',
              body: `جلسه «${meeting.title}» به‌زودی برگزار می‌شود.`,
              entityType: NotificationEntityType.MEETING,
              entityId: meeting.id,
              actionUrl: `/meetings/${meeting.id}`,
              metadata: { ...metadata } satisfies Prisma.InputJsonObject,
            })),
          });
          await tx.meeting.update({ where: { id: meeting.id }, data: { reminderSentAt: new Date() } });
          await tx.auditLog.create({ data: { organizationId: meeting.organizationId, entityType: 'meeting', entityId: meeting.id, action: 'meeting.reminder_sent', metadata: { recipientCount: recipientIds.length } } });
        }
      }, { timeout: 30000 });
    } catch (error) { this.logger.error('Meeting reminder processing failed', error instanceof Error ? error.stack : undefined); }
  }

  private organizationTimeZone(value: string | null | undefined) {
    const timeZone = value?.trim();

    if (!timeZone) {
      return DEFAULT_ORGANIZATION_TIME_ZONE;
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format();
      return timeZone;
    } catch {
      return DEFAULT_ORGANIZATION_TIME_ZONE;
    }
  }
}
