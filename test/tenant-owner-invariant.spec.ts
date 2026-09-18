import { OrganizationMembershipsService } from '../src/organization-memberships/organization-memberships.service';

describe('last tenant owner invariant fix 000091', () => {
  const service = (count: number, target: object | null) => {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ lockResult: '' }]),
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue(target), count: jest.fn().mockResolvedValue(count), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    return { tx, memberships: new OrganizationMembershipsService({} as any) };
  };

  it('blocks deactivation of the last active owner under an advisory transaction lock', async () => {
    const { tx, memberships } = service(1, { id: 'owner-membership' });
    await expect(memberships.suspendForUser(tx, 'owner', 'org-a')).rejects.toThrow('last active tenant owner');
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.organizationMembership.updateMany).not.toHaveBeenCalled();
  });

  it('allows legacy zero-owner tenants to remain zero', async () => {
    const { tx, memberships } = service(0, null);
    await expect(memberships.suspendForUser(tx, 'member', 'org-a')).resolves.toEqual({ count: 1 });
  });

  it('allows one of two active owners to be deactivated', async () => {
    const { tx, memberships } = service(2, { id: 'owner-membership' });
    await expect(memberships.suspendForUser(tx, 'owner', 'org-a')).resolves.toEqual({ count: 1 });
  });
});
