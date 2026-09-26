import { PrismaService } from '../src/prisma/prisma.service';
import { tenantUser } from './helpers/tenant-user';
import { UserRole } from '@prisma/client';

describe('fix 000087 PostgreSQL RLS boundary', () => {
  it('installs parameterized transaction-local Tenant context before work', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ organizationId: 'tenant-a' }]) };
    const prisma = Object.create(PrismaService.prototype) as PrismaService;
    (prisma as any).$transaction = jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
    const context = (tenantUser({
      userId: 'user-a',
      email: 'a@example.com',
      role: UserRole.ADMIN,
      organizationId: 'tenant-a',
    }) as any).tenantContext;
    const callback = jest.fn().mockResolvedValue('done');

    await expect(prisma.withTenantTransaction(context, callback)).resolves.toBe('done');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(tx);
    const query = tx.$queryRaw.mock.calls[0][0];
    expect(query.strings.join('?')).toContain("set_config(\n          'app.current_organization_id'");
    expect(query.values).toEqual(['tenant-a']);
    expect(query.strings.join('?')).toContain('true');
  });
});
