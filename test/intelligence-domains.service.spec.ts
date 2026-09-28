import { ConflictException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Prisma } from '@prisma/client';
import { PlatformIntelligenceDomainsController } from '../src/intelligence-domains/intelligence-domains.controller';
import { IntelligenceDomainsService } from '../src/intelligence-domains/intelligence-domains.service';
import { PlatformAdminGuard } from '../src/platform-authority/platform-admin.guard';

const platform = { userId: 'platform-user', platformAdmin: true as const, platformRole: 'PLATFORM_ADMIN' as const };
function harness() {
  const rows: any[] = [];
  const intelligenceDomain = {
    create: jest.fn(async ({ data }: any) => { if (rows.some(row => row.code === data.code)) throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.22.0' }); const row = { id: `domain-${rows.length + 1}`, ...data, isActive: true, createdAt: new Date(), updatedAt: new Date() }; rows.push(row); return row; }),
    findMany: jest.fn(async ({ where = {}, skip = 0, take = 20 }: any) => rows.filter(row => where.isActive === undefined || row.isActive === where.isActive).slice(skip, skip + take)),
    count: jest.fn(async ({ where = {} }: any) => rows.filter(row => where.isActive === undefined || row.isActive === where.isActive).length),
    findUnique: jest.fn(async ({ where }: any) => rows.find(row => row.id === where.id) ?? null),
    update: jest.fn(async ({ where, data }: any) => Object.assign(rows.find(row => row.id === where.id), data, { updatedAt: new Date() })),
  };
  const auditLog = { create: jest.fn().mockResolvedValue({ id: 'audit' }) };
  const prisma: any = { intelligenceDomain, auditLog, $transaction: jest.fn(async (arg: any) => Array.isArray(arg) ? Promise.all(arg) : arg({ intelligenceDomain, auditLog })) };
  const audit: any = { recordPlatformEvent: jest.fn(async (_p, input, db) => db.auditLog.create({ data: input })) };
  return { rows, service: new IntelligenceDomainsService(prisma, audit), audit };
}

describe('IntelligenceDomainsService', () => {
  it('normalizes immutable globally unique codes and audits creation', async () => {
    const { service, audit } = harness();
    await expect(service.create({ code: 'Financial_Services', name: 'Financial Services' }, platform)).resolves.toMatchObject({ code: 'financial-services' });
    await expect(service.create({ code: 'financial-services', name: 'Duplicate' }, platform)).rejects.toBeInstanceOf(ConflictException);
    expect(audit.recordPlatformEvent).toHaveBeenCalledWith(platform, expect.objectContaining({ action: 'intelligence-domain.created' }), expect.anything());
  });
  it('separates active selection from administration and preserves records on deactivation', async () => {
    const { service } = harness(); const created = await service.create({ code: 'healthcare', name: 'Healthcare' }, platform);
    await service.setActive(created.id, false, platform);
    expect((await service.listSelectable({}, {} as any)).data).toHaveLength(0);
    expect((await service.listAdmin({ isActive: false }, platform)).data).toHaveLength(1);
    await expect(service.setActive(created.id, true, platform)).resolves.toMatchObject({ isActive: true });
  });
  it('updates metadata and rejects missing records', async () => {
    const { service } = harness(); const created = await service.create({ code: 'healthcare', name: 'Healthcare' }, platform);
    await expect(service.update(created.id, { description: 'Health monitoring' }, platform)).resolves.toMatchObject({ code: 'healthcare', description: 'Health monitoring' });
    await expect(service.findOne('missing', platform)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('protects global mutation controllers with PlatformAdminGuard', () => { expect(Reflect.getMetadata(GUARDS_METADATA, PlatformIntelligenceDomainsController)).toContain(PlatformAdminGuard); });
});
