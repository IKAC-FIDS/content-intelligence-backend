import { Injectable, NotFoundException } from '@nestjs/common';
import { MeetingStatus, TaskStatus } from '@prisma/client';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { getCurrentOrganizationId } from '../common/tenant/tenant-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyOverviewDto } from './dto/company-overview.dto';

@Injectable()
export class CompanyOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    companyId: string,
    user: CurrentUserPayload,
  ): Promise<CompanyOverviewDto> {
    const organizationId = getCurrentOrganizationId(user);

    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        organizationId,
      },
      select: {
        id: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const now = new Date();

    const [
      peopleCount,
      branchCount,
      socialChannelCount,
      opportunityCount,
      openOpportunityCount,
      taskCount,
      activeTaskCount,
      meetingCount,
      upcomingMeetingCount,
      activityCount,
      legalDocumentCount,
    ] = await Promise.all([
      this.prisma.person.count({
        where: {
          companyId,
          company: { organizationId },
        },
      }),
      this.prisma.companyBranch.count({
        where: {
          companyId,
          company: { organizationId },
        },
      }),
      this.prisma.companySocialChannel.count({
        where: {
          companyId,
          company: { organizationId },
        },
      }),
      this.prisma.opportunity.count({
        where: {
          companyId,
          organizationId,
        },
      }),
      this.prisma.opportunity.count({
        where: {
          companyId,
          organizationId,
          stage: {
            isTerminal: false,
          },
        },
      }),
      this.prisma.task.count({
        where: {
          companyId,
          organizationId,
        },
      }),
      this.prisma.task.count({
        where: {
          companyId,
          organizationId,
          status: {
            in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS],
          },
        },
      }),
      this.prisma.meeting.count({
        where: {
          companyId,
          organizationId,
        },
      }),
      this.prisma.meeting.count({
        where: {
          companyId,
          organizationId,
          status: MeetingStatus.SCHEDULED,
          startAt: {
            gte: now,
          },
        },
      }),
      this.prisma.activity.count({
        where: {
          companyId,
          company: { organizationId },
        },
      }),
      this.prisma.companyLegalDocument.count({
        where: {
          companyId,
          company: { organizationId },
        },
      }),
    ]);

    return {
      companyId,
      generatedAt: new Date().toISOString(),
      summary: {
        peopleCount,
        branchCount,
        socialChannelCount,
        opportunityCount,
        openOpportunityCount,
        taskCount,
        activeTaskCount,
        meetingCount,
        upcomingMeetingCount,
        activityCount,
        legalDocumentCount,
      },
    };
  }
}
