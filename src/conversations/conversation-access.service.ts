import { Injectable } from '@nestjs/common';
import { ConversationEntityType } from '@prisma/client';
import { ActivitiesService } from '../activities/activities.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CompanyAccessService } from '../companies/company-access.service';
import { TasksService } from '../tasks/tasks.service';

export type ConversationEntityAccess = {
  entityType: ConversationEntityType;
  entityId: string;
  label: string;
  responsibleUserIds: string[];
  actionUrl: string;
};

@Injectable()
export class ConversationAccessService {
  constructor(
    private readonly companies: CompanyAccessService,
    private readonly tasks: TasksService,
    private readonly activities: ActivitiesService,
  ) {}

  async assertReadable(entityType: ConversationEntityType, entityId: string, user: CurrentUserPayload): Promise<ConversationEntityAccess> {
    if (entityType === ConversationEntityType.COMPANY) {
      const company = await this.companies.assertCompanyReadable(entityId, user);
      return {
        entityType,
        entityId,
        label: company.brandName || company.legalName,
        responsibleUserIds: company.ownerId ? [company.ownerId] : [],
        actionUrl: `/companies/${entityId}#conversation`,
      };
    }
    if (entityType === ConversationEntityType.TASK) {
      const task = await this.tasks.assertReadable(entityId, user);
      return {
        entityType,
        entityId,
        label: task.title,
        responsibleUserIds: [task.assignedToId, task.reviewerId].filter((id): id is string => Boolean(id)),
        actionUrl: `/tasks/${entityId}#conversation`,
      };
    }
    const activity = await this.activities.assertReadable(entityId, user);
    return {
      entityType,
      entityId,
      label: activity.outcome || activity.notes || activity.type,
      responsibleUserIds: [activity.userId],
      actionUrl: `/activities?activityId=${encodeURIComponent(entityId)}&conversation=1`,
    };
  }
}
