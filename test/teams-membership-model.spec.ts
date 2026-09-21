import { OrganizationMembershipStatus } from '@prisma/client';
import { TeamsService } from '../src/teams/teams.service';

const actor: any = {
  userId: 'admin-a',
  role: 'CUSTOM_TEAM_ADMIN',
  tenantContext: {
    organizationId: 'org-a',
    tenantId: 'org-a',
    userId: 'admin-a',
    membershipId: 'membership-admin',
    membershipStatus: 'active',
    resolutionSource: 'token-session',
    tenantRole: 'CUSTOM_TEAM_ADMIN',
    platformAdmin: false,
    permissions: ['team:view', 'team:manage'],
  },
};

const membership = {
  id: 'membership-a',
  status: OrganizationMembershipStatus.ACTIVE,
  roleId: 'role-a',
  role: { id: 'role-a', code: 'EDITOR', name: 'Editor' },
  user: {
    id: 'user-a',
    fullName: 'User A',
    email: 'user-a@example.test',
    isActive: true,
    avatarObjectKey: null,
  },
};

function setup(teamId = 'team-a') {
  const prisma: any = {
    team: {
      findFirst: jest.fn().mockResolvedValue({
        id: teamId,
        code: teamId.toUpperCase(),
        name: teamId,
        isActive: true,
        organizationId: 'org-a',
        manager: null,
        _count: { membershipLinks: 0 },
      }),
    },
    organizationMembership: {
      findUnique: jest.fn().mockResolvedValue(membership),
      findUniqueOrThrow: jest.fn().mockResolvedValue(membership),
    },
    organizationMembershipTeam: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({
        membershipId: membership.id,
        teamId,
      }),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const audit: any = { record: jest.fn().mockResolvedValue({}) };
  return { prisma, service: new TeamsService(prisma, audit) };
}

describe('TeamsService membership-based team grouping', () => {
  it('adds a Team link to the tenant Membership without mutating User identity', async () => {
    const first = setup('team-a');
    await first.service.addMember('team-a', { userId: 'user-a' }, actor);

    expect(first.prisma.organizationMembershipTeam.upsert).toHaveBeenCalledWith({
      where: {
        membershipId_teamId: {
          membershipId: 'membership-a',
          teamId: 'team-a',
        },
      },
      create: { membershipId: 'membership-a', teamId: 'team-a' },
      update: {},
    });
    expect(first.prisma.user).toBeUndefined();

    const second = setup('team-b');
    await second.service.addMember('team-b', { userId: 'user-a' }, actor);
    expect(second.prisma.organizationMembershipTeam.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { membershipId: 'membership-a', teamId: 'team-b' },
      }),
    );
  });

  it('removes only the requested Membership-Team link', async () => {
    const { prisma, service } = setup('team-a');
    await service.removeMember('team-a', 'user-a', actor);

    expect(prisma.organizationMembershipTeam.delete).toHaveBeenCalledWith({
      where: {
        membershipId_teamId: {
          membershipId: 'membership-a',
          teamId: 'team-a',
        },
      },
    });
    expect(prisma.organizationMembership.update).toBeUndefined();
    expect(prisma.user).toBeUndefined();
  });
});
