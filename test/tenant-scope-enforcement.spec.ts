import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ActivitiesService } from '../src/activities/activities.service';
import { AttachmentsService } from '../src/attachments/attachments.service';
import { quotaMock } from './helpers/quota';
import { AuditLogService } from '../src/audit-log/audit-log.service';
import { CompanyAccessService } from '../src/companies/company-access.service';
import {
  getCurrentOrganizationId,
  tenantScope,
} from '../src/common/tenant/tenant-scope.util';
import { MeetingsService } from '../src/meetings/meetings.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PeopleService } from '../src/people/people.service';
import { ReportingScopeService } from '../src/reports/reporting-scope.service';
import { tenantUser } from './helpers/tenant-user';

const tenantA = tenantUser({
  userId: 'user-a',
  email: 'a@example.com',
  role: UserRole.ADMIN as any,
  organizationId: 'tenant-a',
});

describe('fix 000085 Tenant Scope enforcement', () => {
  it('fails closed before Prisma when TenantContext is missing', async () => {
    const findFirst = jest.fn();
    const service = new CompanyAccessService({ company: { findFirst } } as any);

    await expect(
      service.assertCompanyReadable('company-a', {
        userId: 'user-a',
        email: 'a@example.com',
        role: UserRole.ADMIN,
        organizationId: 'tenant-a',
      }),
    ).rejects.toThrow('TenantContext is required');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('uses TenantContext as the only authority and ignores spoofed legacy organizationId', () => {
    expect(
      getCurrentOrganizationId({ ...tenantA, organizationId: 'tenant-b' }),
    ).toBe('tenant-a');
    expect(tenantScope.direct(tenantA, { id: 'record-a' })).toEqual({
      AND: [{ id: 'record-a' }, { organizationId: 'tenant-a' }],
    });
    expect(tenantScope.throughCompany(tenantA, { id: 'child-a' })).toEqual({
      AND: [{ id: 'child-a' }, { company: { organizationId: 'tenant-a' } }],
    });
  });

  it('returns non-enumerating not-found for a foreign Company ID', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new CompanyAccessService({ company: { findFirst } } as any);
    await expect(
      service.assertCompanyMutable('company-b', tenantA),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'company-b', organizationId: 'tenant-a', archivedAt: null },
    });
  });

  it('scopes People and Activity lists through Company ownership', async () => {
    const peoplePrisma = {
      person: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    await new PeopleService(peoplePrisma as any, {} as any).findDirectory(
      {},
      tenantA,
    );
    expect(
      peoplePrisma.person.findMany.mock.calls[0][0].where.AND,
    ).toContainEqual({
      company: { organizationId: 'tenant-a', archivedAt: null },
    });

    const activityPrisma = {
      activity: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    await new ActivitiesService(
      activityPrisma as any,
      {} as any,
      {} as any,
    ).findAll({}, tenantA);
    expect(
      activityPrisma.activity.findMany.mock.calls[0][0].where.AND,
    ).toContainEqual({
      company: { organizationId: 'tenant-a', archivedAt: null },
    });
  });

  it('blocks cross-Tenant create relations before child creation', async () => {
    const create = jest.fn();
    const companyAccess = {
      assertCompanyMutable: jest
        .fn()
        .mockRejectedValue(new NotFoundException('Company not found')),
    };
    const service = new PeopleService(
      { person: { create } } as any,
      companyAccess as any,
    );
    await expect(
      service.create(
        { companyId: 'company-b', fullName: 'Foreign relation' } as any,
        tenantA,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });

  it('blocks cross-Tenant update and delete without issuing mutations', async () => {
    const prisma = {
      person: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const service = new PeopleService(prisma as any, {} as any);
    await expect(
      service.update('person-b', { fullName: 'Changed' } as any, tenantA),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('person-b', tenantA)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.person.update).not.toHaveBeenCalled();
    expect(prisma.person.deleteMany).not.toHaveBeenCalled();
    expect(prisma.person.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'person-b',
          company: { organizationId: 'tenant-a' },
        },
      }),
    );
  });

  it('blocks foreign attachment download before object storage access', async () => {
    const storage = { getStream: jest.fn() };
    const prisma = {
      fileAttachment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new AttachmentsService(
      prisma as any,
      { get: jest.fn() } as any,
      { record: jest.fn() } as any,
      storage as any,
      quotaMock() as any,
    );
    await expect(
      service.getDownloadStream('attachment-b', tenantA),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.fileAttachment.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'attachment-b',
        organizationId: 'tenant-a',
        deletedAt: null,
      },
    });
    expect(storage.getStream).not.toHaveBeenCalled();
  });

  it('scopes Meeting and Notification ID/list access directly', async () => {
    const meetingPrisma = {
      meeting: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    await expect(
      new MeetingsService(meetingPrisma as any, {} as any, {} as any, { publishDomainEvent: jest.fn() } as any).findOne(
        'meeting-b',
        tenantA,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(meetingPrisma.meeting.findFirst.mock.calls[0][0].where).toEqual({
      id: 'meeting-b',
      organizationId: 'tenant-a',
    });

    const notificationPrisma: any = {
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    notificationPrisma.withTenantTransaction = jest.fn(
      async (_context: unknown, callback: (tx: unknown) => unknown) =>
        callback(notificationPrisma),
    );
    await new NotificationsService(
      notificationPrisma as any,
      {} as any,
    ).findAll({}, tenantA);
    expect(
      notificationPrisma.notification.findMany.mock.calls[0][0].where.AND[0],
    ).toEqual({
      organizationId: 'tenant-a',
      recipientId: 'user-a',
    });
  });

  it('scopes reports and excludes ambiguous/foreign Audit Logs', async () => {
    const reportWhere = new ReportingScopeService().opportunity({}, tenantA);
    expect(reportWhere.AND).toContainEqual(
      expect.objectContaining({ organizationId: 'tenant-a' }),
    );

    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await new AuditLogService(
      prisma as any,
      { getContext: jest.fn() } as any,
      {} as any,
    ).findAll({}, tenantA);
    expect(prisma.auditLog.findMany.mock.calls[0][0].where.organizationId).toBe(
      'tenant-a',
    );
  });

  it('requires active Membership scope for cross-user relationships', () => {
    expect(tenantScope.activeMembership(tenantA)).toEqual({
      organizationMemberships: {
        some: { organizationId: 'tenant-a', status: 'ACTIVE' },
      },
    });
  });
});
