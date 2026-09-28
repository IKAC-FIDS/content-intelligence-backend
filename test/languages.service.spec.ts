import { ConflictException, NotFoundException } from '@nestjs/common';
import { LanguageDirection, Prisma } from '@prisma/client';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PlatformAdminGuard } from '../src/platform-authority/platform-admin.guard';
import { LanguagesService } from '../src/languages/languages.service';
import { PlatformLanguagesController } from '../src/languages/languages.controller';

const platform = { userId: 'platform-user', platformAdmin: true as const, platformRole: 'PLATFORM_ADMIN' as const };

function harness() {
  const rows: any[] = [];
  const language = {
    create: jest.fn(async ({ data }: any) => { if (rows.some(row => row.code.toLowerCase() === data.code.toLowerCase())) throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.22.0' }); const row = { id: `language-${rows.length + 1}`, ...data, isActive: true, createdAt: new Date(), updatedAt: new Date() }; rows.push(row); return row; }),
    findMany: jest.fn(async ({ where = {}, skip = 0, take = 20 }: any) => rows.filter(row => where.isActive === undefined || row.isActive === where.isActive).slice(skip, skip + take)),
    count: jest.fn(async ({ where = {} }: any) => rows.filter(row => where.isActive === undefined || row.isActive === where.isActive).length),
    findUnique: jest.fn(async ({ where }: any) => rows.find(row => row.id === where.id) ?? null),
    update: jest.fn(async ({ where, data }: any) => Object.assign(rows.find(row => row.id === where.id), data, { updatedAt: new Date() })),
  };
  const auditLog = { create: jest.fn().mockResolvedValue({ id: 'audit' }) };
  const prisma: any = { language, auditLog, $transaction: jest.fn(async (arg: any) => Array.isArray(arg) ? Promise.all(arg) : arg({ language, auditLog })) };
  const audit: any = { recordPlatformEvent: jest.fn(async (_p, input, db) => db.auditLog.create({ data: input })) };
  return { rows, language, audit, service: new LanguagesService(prisma, audit) };
}

describe('LanguagesService', () => {
  it('canonicalizes globally unique BCP-47 codes and audits creation', async () => {
    const { service, audit } = harness();
    await expect(service.create({ code: 'pt-br', name: 'Portuguese', nativeName: 'Português', direction: LanguageDirection.LTR }, platform)).resolves.toMatchObject({ code: 'pt-BR' });
    await expect(service.create({ code: 'pt-BR', name: 'Duplicate', nativeName: 'Duplicate', direction: LanguageDirection.LTR }, platform)).rejects.toBeInstanceOf(ConflictException);
    expect(audit.recordPlatformEvent).toHaveBeenCalledWith(platform, expect.objectContaining({ action: 'language.created' }), expect.anything());
  });

  it('lists active catalog separately and supports lifecycle changes', async () => {
    const { service } = harness();
    const created = await service.create({ code: 'de', name: 'German', nativeName: 'Deutsch', direction: LanguageDirection.LTR }, platform);
    await service.setActive(created.id, false, platform);
    expect((await service.listSelectable({}, {} as any)).data).toHaveLength(0);
    expect((await service.listAdmin({ isActive: false }, platform)).data).toHaveLength(1);
    await expect(service.setActive(created.id, true, platform)).resolves.toMatchObject({ isActive: true });
  });

  it('updates metadata without exposing code mutation and rejects missing records', async () => {
    const { service } = harness();
    const created = await service.create({ code: 'de', name: 'German', nativeName: 'Deutsch', direction: LanguageDirection.LTR }, platform);
    await expect(service.update(created.id, { nativeName: 'Deutsch (Deutschland)' }, platform)).resolves.toMatchObject({ code: 'de', nativeName: 'Deutsch (Deutschland)' });
    await expect(service.findOne('missing', platform)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('protects global mutation controllers with PlatformAdminGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PlatformLanguagesController)).toContain(PlatformAdminGuard);
  });
});
