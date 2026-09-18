import { ActivitiesService } from '../src/activities/activities.service';
import { tenantUser } from './helpers/tenant-user';

describe('Library-backed activity types', () => {
  const user = tenantUser({ userId: 'user-1', email: 'test@example.com', role: 'ADMIN' as const });
  function setup(active = true) {
    const prisma = {
      lookupOption: { findFirst: jest.fn().mockResolvedValue(active ? { code: 'CUSTOM' } : null) },
      activity: {
        create: jest.fn().mockResolvedValue({ id: 'a', type: 'CUSTOM' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'a', companyId: 'c', type: 'CUSTOM' }),
        update: jest.fn().mockResolvedValue({ id: 'a', type: 'CUSTOM' }),
      },
    };
    const service = new ActivitiesService(prisma as any, { record: jest.fn() } as any,
      { assertCompanyMutable: jest.fn() } as any);
    return { service, prisma };
  }
  it('saves an active custom type', async () => {
    const { service, prisma } = setup();
    await service.create({ companyId: 'c', type: 'CUSTOM' }, user);
    expect(prisma.lookupOption.findFirst).toHaveBeenCalledWith({ where: { group: 'activity-types', code: 'CUSTOM', isActive: true } });
    expect(prisma.activity.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'CUSTOM' }) }));
  });
  it('rejects unknown or inactive types without saving', async () => {
    const { service, prisma } = setup(false);
    await expect(service.create({ companyId: 'c', type: 'CUSTOM' }, user)).rejects.toThrow();
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });
  it('keeps system stage changes out of manual creation', async () => {
    const { service, prisma } = setup();
    await expect(service.create({ companyId: 'c', type: 'STAGE_CHANGE' }, user)).rejects.toThrow();
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });
  it('preserves an unchanged historical type when editing', async () => {
    const { service, prisma } = setup(false);
    await service.updateActivity('a', { type: 'CUSTOM', notes: 'updated' }, user);
    expect(prisma.lookupOption.findFirst).not.toHaveBeenCalled();
    expect(prisma.activity.update).toHaveBeenCalled();
  });
  it('validates a changed type when editing', async () => {
    const { service, prisma } = setup(false);
    await expect(service.updateActivity('a', { type: 'OTHER' }, user)).rejects.toThrow();
    expect(prisma.activity.update).not.toHaveBeenCalled();
  });
});
