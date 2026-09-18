import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('defines fail-closed read and write policies and FORCE RLS for notifications', () => {
    const sql = readFileSync(
      join(process.cwd(), 'prisma/migrations/20260810170000_add_notification_rls/migration.sql'),
      'utf8',
    );

    expect(sql).toContain("current_setting('app.current_organization_id', true)");
    expect(sql).toContain('NULLIF(');
    expect(sql).toMatch(/FOR SELECT[\s\S]*USING/);
    expect(sql).toMatch(/FOR INSERT[\s\S]*WITH CHECK/);
    expect(sql).toMatch(/FOR UPDATE[\s\S]*USING[\s\S]*WITH CHECK/);
    expect(sql).toMatch(/FOR DELETE[\s\S]*USING/);
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).not.toContain('SECURITY DEFINER');
  });
});
