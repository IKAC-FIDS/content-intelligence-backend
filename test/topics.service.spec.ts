import { ConflictException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Prisma } from '@prisma/client';
import { PlatformAdminGuard } from '../src/platform-authority/platform-admin.guard';
import { PlatformTopicsController } from '../src/topics/topics.controller';
import { TopicsService } from '../src/topics/topics.service';
const platform = { userId: 'platform', platformAdmin: true as const, platformRole: 'PLATFORM_ADMIN' as const };
function harness() {
  const rows: any[] = [];
  const topic = {
    create: jest.fn(async ({ data }: any) => {
      if (rows.some((row) => row.code === data.code)) throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.22.0' });
      const row = { id: `topic-${rows.length + 1}`, code: data.code, name: data.name, description: data.description, isActive: true, createdAt: new Date(), updatedAt: new Date(), domainLinks: (data.domainLinks?.create ?? []).map(({ domainId }: any) => ({ domain: { id: domainId, code: domainId, name: domainId, description: null, isActive: true } })), aliases: (data.aliases?.create ?? []).map((alias: any, index: number) => ({ id: `alias-${index}`, ...alias, language: null, createdAt: new Date(), updatedAt: new Date() })) };
      rows.push(row); return row;
    }),
    findMany: jest.fn(async ({ where = {} }: any) => rows.filter((row) => where.isActive === undefined || row.isActive === where.isActive)),
    count: jest.fn(async ({ where = {} }: any) => rows.filter((row) => where.isActive === undefined || row.isActive === where.isActive).length),
    findUnique: jest.fn(async ({ where }: any) => rows.find((row) => row.id === where.id) ?? null),
    update: jest.fn(async ({ where, data }: any) => Object.assign(rows.find((row) => row.id === where.id), data)),
  };
  const intelligenceDomain = { findMany: jest.fn(async ({ where }: any) => (where.id.in ?? []).map((id: string) => ({ id, isActive: true }))) };
  const language = { findMany: jest.fn(async ({ where }: any) => (where.id.in ?? []).map((id: string) => ({ id, isActive: true }))) };
  const topicDomain = { deleteMany: jest.fn(), createMany: jest.fn() };
  const topicAlias = { deleteMany: jest.fn(), createMany: jest.fn() };
  const auditLog = { create: jest.fn() };
  const tx: any = { topic, intelligenceDomain, language, topicDomain, topicAlias, auditLog };
  const prisma: any = { ...tx, $transaction: jest.fn(async (arg: any) => Array.isArray(arg) ? Promise.all(arg) : arg(tx)) };
  const audit: any = { recordPlatformEvent: jest.fn(async (_platform: any, input: any, db: any) => db.auditLog.create({ data: input })) };
  return { service: new TopicsService(prisma, audit) };
}
describe('TopicsService', () => {
  it('creates one canonical Topic with multiple Domains and normalized aliases', async () => {
    const { service } = harness();
    await expect(service.create({ code: 'Zero_Trust', name: 'Zero Trust', domainIds: ['domain-a', 'domain-b'], aliases: [{ value: '  ZT  ' }, { value: 'اعتماد صفر', languageId: 'language-fa' }] }, platform)).resolves.toMatchObject({ code: 'zero-trust', domains: [{ id: 'domain-a' }, { id: 'domain-b' }], aliases: [{ value: 'ZT', normalizedValue: 'zt' }, { value: 'اعتماد صفر' }] });
  });
  it('rejects duplicate canonical code', async () => { const { service } = harness(); await service.create({ code: 'zero-trust', name: 'Zero Trust', domainIds: [] }, platform); await expect(service.create({ code: 'zero-trust', name: 'Duplicate', domainIds: [] }, platform)).rejects.toBeInstanceOf(ConflictException); });
  it('preserves records during lifecycle changes', async () => { const { service } = harness(); const created = await service.create({ code: 'zero-trust', name: 'Zero Trust', domainIds: [] }, platform); await expect(service.setActive(created.id, false, platform)).resolves.toMatchObject({ isActive: false }); expect((await service.listSelectable({}, {} as any)).data).toHaveLength(0); });
  it('protects global mutation with PlatformAdminGuard', () => expect(Reflect.getMetadata(GUARDS_METADATA, PlatformTopicsController)).toContain(PlatformAdminGuard));
});
