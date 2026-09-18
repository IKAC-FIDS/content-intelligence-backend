import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindOwnerOptionsDto } from '../src/users/dto/find-owner-options.dto';
import { UsersService } from '../src/users/users.service';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { tenantUser } from './helpers/tenant-user';
import { quotaMock } from './helpers/quota';

const organizationId = '00000000-0000-4000-8000-000000000001';
const otherOrganizationId = '00000000-0000-4000-8000-000000000002';
const callerId = '00000000-0000-4000-8000-000000000010';
const selectedId = '00000000-0000-4000-8000-000000000011';
const teamId = '00000000-0000-4000-8000-000000000012';
const rep = tenantUser({
  userId: callerId,
  email: 'rep@example.com',
  role: UserRole.REP,
  organizationId,
});
const manager = { ...rep, role: UserRole.MANAGER, teamId };
const option = {
  id: selectedId,
  fullName: 'علی رضایی',
  email: 'ali@example.com',
  role: UserRole.REP,
  roleId: null,
  teamId,
  team: 'SALES',
  teamRef: { id: teamId, code: 'SALES', name: 'Sales' },
};

function setup() {
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([option]),
      count: jest.fn().mockResolvedValue(51),
      findFirst: jest.fn().mockResolvedValue(option),
      update: jest.fn().mockResolvedValue(option),
    },
    team: { findFirst: jest.fn().mockResolvedValue({ id: teamId }) },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const memberships = {
    createInitialMembership: jest.fn(),
    suspendForUser: jest.fn(),
    activateForUser: jest.fn(),
    syncDefaultAssignment: jest.fn(),
  };
  return {
    prisma,
    audit,
    memberships,
    service: new UsersService(
      prisma as any,
      audit as any,
      memberships as any,
      quotaMock() as any,
    ),
  };
}

describe('UsersService owner options', () => {
  it('allows a REP caller because authorization belongs to PermissionsGuard', async () => {
    const { service, prisma } = setup();
    await expect(service.getOwnerOptions(rep)).resolves.toEqual([option]);
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      organizationId,
      isActive: true,
      role: { in: [UserRole.REP, UserRole.MANAGER] },
    });
  });

  it('also allows a dynamic-role caller whose base payload role is REP', async () => {
    const { service } = setup();
    await expect(service.findOwnerOptions(rep, {})).resolves.toEqual(
      expect.objectContaining({ data: [option] }),
    );
  });

  it('returns only active REP/MANAGER users in the current organization', async () => {
    const { service, prisma } = setup();
    await service.findOwnerOptions(rep, {});
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      organizationId,
      isActive: true,
      role: { in: [UserRole.REP, UserRole.MANAGER] },
    });
  });

  it('does not silently limit a manager to their own team', async () => {
    const { service, prisma } = setup();
    await service.findOwnerOptions(manager, {});
    expect(prisma.user.findMany.mock.calls[0][0].where.teamId).toBeUndefined();
  });

  it('applies an explicit teamId only after validating it in the organization', async () => {
    const { service, prisma } = setup();
    await service.findOwnerOptions(rep, { teamId });
    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: { id: teamId, organizationId, isActive: true },
      select: { id: true },
    });
    expect(prisma.user.findMany.mock.calls[0][0].where.teamId).toBe(teamId);
  });

  it('rejects a team outside the organization without exposing it', async () => {
    const { service, prisma } = setup();
    prisma.team.findFirst.mockResolvedValue(null);
    await expect(
      service.findOwnerOptions(rep, { teamId }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['fullName', 'email'])(
    'searches %s case-insensitively in Prisma',
    async (field) => {
      const { service, prisma } = setup();
      await service.findOwnerOptions(rep, { search: ' علی ' });
      expect(prisma.user.findMany.mock.calls[0][0].where.OR).toContainEqual({
        [field]: { contains: 'علی', mode: 'insensitive' },
      });
    },
  );

  it('returns standard pagination metadata', async () => {
    const { service, prisma } = setup();
    prisma.user.count.mockResolvedValue(51);
    const result = await service.findOwnerOptions(rep, { page: 2, limit: 25 });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25 }),
    );
    expect(result.meta).toEqual({
      total: 51,
      page: 2,
      limit: 25,
      totalPages: 3,
      hasNext: true,
      hasPrevious: true,
    });
  });

  it('hydrates selectedId independently of the first page and search', async () => {
    const { service, prisma } = setup();
    await service.findOwnerOptions(rep, { selectedId, search: 'other' });
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.id).toBe(selectedId);
    expect(where.OR).toBeUndefined();
  });

  it('rejects a page size above 50 through DTO validation', async () => {
    const dto = plainToInstance(FindOwnerOptionsDto, { limit: '51' });
    expect(await validate(dto)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'limit' })]),
    );
  });
});

describe('UsersService tenant isolation audit', () => {
  it('scopes user lists and detail reads to the actor organization', async () => {
    const { service, prisma } = setup();
    await service.findAll({}, rep);
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      AND: [{ organizationId }],
    });
    await service.findOne(selectedId, rep);
    expect(prisma.user.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: selectedId, organizationId } }),
    );
  });

  it('returns 404 for cross-organization activation and deactivation targets', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    const otherTenant = tenantUser(
      { ...rep, organizationId: otherOrganizationId },
      otherOrganizationId,
    );
    await expect(
      service.deactivate(selectedId, otherTenant),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.activate(selectedId, otherTenant),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 before changing the role of a user in another organization', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.updateUserRole(
        selectedId,
        { role: UserRole.REP },
        tenantUser(
          { ...rep, organizationId: otherOrganizationId },
          otherOrganizationId,
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: selectedId, organizationId: otherOrganizationId },
      }),
    );
  });
});

describe('owner-options PermissionsGuard policy', () => {
  function guardSetup(actions: string[], roleId: string | null = null) {
    const request = { user: { userId: callerId, role: UserRole.REP } };
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue({ actions: ['company:assign-owner'], mode: 'all' }),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: callerId,
          role: UserRole.REP,
          roleId,
          isActive: true,
        }),
      },
      rolePermission: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            actions.map((action) => ({ permission: { action } })),
          ),
      },
    };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    };
    return {
      guard: new PermissionsGuard(reflector as any, prisma as any),
      context,
    };
  }

  it('accepts company:assign-owner from a custom dynamic role based on REP', async () => {
    PermissionsGuard.clearCache();
    const { guard, context } = guardSetup(['company:assign-owner'], selectedId);
    await expect(guard.canActivate(context as any)).resolves.toBe(true);
  });

  it('returns 403 from PermissionsGuard when the permission is absent', async () => {
    PermissionsGuard.clearCache();
    const { guard, context } = guardSetup([], selectedId);
    await expect(guard.canActivate(context as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
