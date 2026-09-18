import { UserRole } from '@prisma/client';
import { ActivityType } from '../src/activities/activity-type';
import { ActivitiesController } from '../src/activities/activities.controller';
import { ActivitiesService } from '../src/activities/activities.service';
import {
  ActivityListStatus,
  FindActivitiesDto,
} from '../src/activities/dto/find-activities.dto';
import {
  PERMISSIONS_KEY,
  PermissionPolicyMetadata,
} from '../src/common/decorators/permissions.decorator';
import { OwnershipScope } from '../src/common/dto/ownership-scope.dto';
import { DashboardController } from '../src/dashboard/dashboard.controller';
import { tenantUser } from './helpers/tenant-user';

const organizationId = '00000000-0000-4000-8000-000000000001';
const user = tenantUser({
  userId: '00000000-0000-4000-8000-000000000002',
  email: 'user@example.com',
  role: UserRole.ADMIN,
  organizationId,
  teamId: 'team-1',
});
const organizationViewer = {
  ...user,
  tenantContext: {
    ...user.tenantContext!,
    permissions: ['activity:view', 'activity:view-organization'],
  },
};
const occurredAt = new Date('2026-07-29T08:00:00.000Z');
const createdAt = new Date('2026-07-29T09:00:00.000Z');
const row = {
  id: 'activity-1',
  type: ActivityType.CALL,
  notes: 'شرح تماس',
  outcome: 'تماس اولیه',
  occurredAt,
  completedAt: null,
  createdAt,
  person: { id: 'person-1', fullName: 'علی رضایی' },
  company: {
    id: 'company-1',
    legalName: 'شرکت نمونه',
    brandName: 'نمونه',
    owner: {
      id: 'owner-1',
      fullName: 'مالک شرکت',
      email: 'owner@example.com',
      team: 'Sales',
      teamId: 'team-1',
    },
  },
  user: {
    id: user.userId,
    fullName: 'ثبت کننده',
    email: user.email,
  },
};

function setup(rows = [row], total = rows.length) {
  const prisma = {
    activity: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(total),
    },
  };
  return {
    prisma,
    service: new ActivitiesService(prisma as any, {} as any, {} as any),
  };
}

describe('Activity Center listing', () => {
  it('returns the requested fields plus legacy activity fields', async () => {
    const { service } = setup();
    const result = await service.findAll({}, user);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: row.id,
        type: row.type,
        title: row.outcome,
        description: row.notes,
        status: ActivityListStatus.RECORDED,
        activityDate: occurredAt,
        createdAt,
        updatedAt: createdAt,
        person: row.person,
        company: {
          id: row.company.id,
          legalName: row.company.legalName,
          brandName: row.company.brandName,
        },
        owner: row.company.owner,
        createdBy: row.user,
        notes: row.notes,
        occurredAt,
      }),
    );
  });

  it('applies pagination and supported sorting', async () => {
    const { service, prisma } = setup([row], 45);
    const result = await service.findAll(
      { page: 2, limit: 20, sortBy: 'createdAt', sortOrder: 'asc' },
      user,
    );
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(result.meta).toEqual({
      total: 45,
      page: 2,
      limit: 20,
      totalPages: 3,
      hasNext: true,
      hasPrevious: true,
    });
  });

  it('searches title, description, person, and company names', async () => {
    const { service, prisma } = setup();
    await service.findAll({ search: ' نمونه ' }, user);
    const search = prisma.activity.findMany.mock.calls[0][0].where.AND.find(
      (item: any) => Array.isArray(item.OR) && item.OR.some((part: any) => part.outcome),
    );
    expect(search.OR).toEqual([
      { outcome: { contains: 'نمونه', mode: 'insensitive' } },
      { notes: { contains: 'نمونه', mode: 'insensitive' } },
      { person: { fullName: { contains: 'نمونه', mode: 'insensitive' } } },
      { company: { legalName: { contains: 'نمونه', mode: 'insensitive' } } },
      { company: { brandName: { contains: 'نمونه', mode: 'insensitive' } } },
    ]);
  });

  it('applies activity, relation, status, and date filters', async () => {
    const { service, prisma } = setup();
    await service.findAll(
      {
        activityType: ActivityType.CALL,
        status: ActivityListStatus.COMPLETED,
        ownerId: '00000000-0000-4000-8000-000000000003',
        createdById: user.userId,
        personId: '00000000-0000-4000-8000-000000000004',
        companyId: '00000000-0000-4000-8000-000000000005',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
      },
      user,
    );
    const and = prisma.activity.findMany.mock.calls[0][0].where.AND;
    expect(and).toEqual(
      expect.arrayContaining([
        { type: ActivityType.CALL },
        { completedAt: { not: null } },
        { company: { ownerId: '00000000-0000-4000-8000-000000000003' } },
        { userId: user.userId },
        { personId: '00000000-0000-4000-8000-000000000004' },
        { companyId: '00000000-0000-4000-8000-000000000005' },
        {
          occurredAt: {
            gte: new Date('2026-07-01T00:00:00.000Z'),
            lt: new Date('2026-08-01T00:00:00.000Z'),
          },
        },
      ]),
    );
  });

  it('keeps tenant isolation and applies ownership shortcuts', async () => {
    const { service, prisma } = setup();
    await service.findAll(
      {
        ownershipScope: OwnershipScope.TEAM,
        team: 'Enterprise',
        mine: true,
        unassigned: true,
      },
      user,
    );
    const and = prisma.activity.findMany.mock.calls[0][0].where.AND;
    expect(and[0]).toEqual({
      OR: [
        { company: { organizationId, archivedAt: null } },
        { task: { organizationId } },
      ],
    });
    expect(and).toEqual(
      expect.arrayContaining([
        { userId: user.userId },
        { company: { ownerId: null } },
      ]),
    );
    expect(JSON.stringify(and)).toContain('Enterprise');
    expect(JSON.stringify(and)).toContain('team-1');
  });

  it('keeps companyId optional for the primary endpoint and compatible when supplied', async () => {
    const { service, prisma } = setup();
    await service.findAll({ companyId: 'company-1' }, user);
    expect(prisma.activity.findMany.mock.calls[0][0].where.AND).toContainEqual({
      companyId: 'company-1',
    });
    expect(new FindActivitiesDto().companyId).toBeUndefined();
  });

  it('limits activity:view to the current user', async () => {
    const { service, prisma } = setup();
    await service.findAll({}, user);

    expect(prisma.activity.findMany.mock.calls[0][0].where.AND).toContainEqual({
      userId: user.userId,
    });
  });

  it('allows organization-wide listing only with activity:view-organization', async () => {
    const { service, prisma } = setup();
    await service.findAll({}, organizationViewer);

    expect(prisma.activity.findMany.mock.calls[0][0].where.AND).not.toContainEqual({
      userId: user.userId,
    });
  });
});

describe('Dashboard latest activities', () => {
  it('returns at most ten latest activities with the compact contract', async () => {
    const { service, prisma } = setup();
    const result = await service.latestActivities(user);
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { occurredAt: 'desc' }, take: 10 }),
    );
    expect(result[0]).toEqual({
      id: row.id,
      type: row.type,
      title: row.outcome,
      activityDate: occurredAt,
      person: row.person,
      company: {
        id: row.company.id,
        legalName: row.company.legalName,
        brandName: row.company.brandName,
      },
      createdBy: row.user,
    });
  });

  it('requires activity:view on both listing and dashboard endpoints', () => {
    const activityPolicy = Reflect.getMetadata(
      PERMISSIONS_KEY,
      ActivitiesController.prototype.findAll,
    ) as PermissionPolicyMetadata;
    const dashboardPolicy = Reflect.getMetadata(
      PERMISSIONS_KEY,
      DashboardController.prototype.latestActivities,
    ) as PermissionPolicyMetadata;
    expect(activityPolicy.actions).toEqual(['activity:view']);
    expect(dashboardPolicy.actions).toEqual(['activity:view']);
  });
});
