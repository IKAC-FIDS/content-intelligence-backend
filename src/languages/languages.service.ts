import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { PlatformScopeContext, TenantContext } from '../common/tenant/tenant-context.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLanguageDto, FindLanguagesDto, LANGUAGE_CODE_PATTERN, UpdateLanguageDto } from './dto/language.dto';

export const languageSelect = { id: true, code: true, name: true, nativeName: true, direction: true, isActive: true, createdAt: true, updatedAt: true } satisfies Prisma.LanguageSelect;

@Injectable()
export class LanguagesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  listSelectable(query: FindLanguagesDto, _tenant: TenantContext) { return this.list({ ...query, isActive: true }); }
  listAdmin(query: FindLanguagesDto, _platform: PlatformScopeContext) { return this.list(query); }

  private async list(query: FindLanguagesDto) {
    const page = query.page ?? 1, limit = query.limit ?? 20, search = query.search?.trim();
    const where: Prisma.LanguageWhereInput = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(search && { OR: [{ code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }, { nativeName: { contains: search, mode: 'insensitive' } }] }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.language.findMany({ where, select: languageSelect, orderBy: [{ name: 'asc' }, { code: 'asc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.language.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return { data, meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 } };
  }

  async findOne(id: string, _platform: PlatformScopeContext) {
    const language = await this.prisma.language.findUnique({ where: { id }, select: languageSelect });
    if (!language) throw new NotFoundException('Language not found');
    return language;
  }

  async create(dto: CreateLanguageDto, platform: PlatformScopeContext) {
    const code = this.normalizeCode(dto.code);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const language = await tx.language.create({ data: { code, name: this.required(dto.name, 'name'), nativeName: this.required(dto.nativeName, 'nativeName'), direction: dto.direction }, select: languageSelect });
        await this.audit.recordPlatformEvent(platform, { entityType: 'language', entityId: language.id, action: 'language.created', after: language }, tx);
        return language;
      });
    } catch (error) { this.rethrowConflict(error); }
  }

  async update(id: string, dto: UpdateLanguageDto, platform: PlatformScopeContext) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.language.findUnique({ where: { id }, select: languageSelect });
      if (!before) throw new NotFoundException('Language not found');
      const after = await tx.language.update({ where: { id }, data: { ...(dto.name !== undefined && { name: this.required(dto.name, 'name') }), ...(dto.nativeName !== undefined && { nativeName: this.required(dto.nativeName, 'nativeName') }), ...(dto.direction !== undefined && { direction: dto.direction }) }, select: languageSelect });
      await this.audit.recordPlatformEvent(platform, { entityType: 'language', entityId: id, action: 'language.updated', before, after }, tx);
      return after;
    });
  }

  setActive(id: string, active: boolean, platform: PlatformScopeContext) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.language.findUnique({ where: { id }, select: languageSelect });
      if (!before) throw new NotFoundException('Language not found');
      if (before.isActive === active) return before;
      const after = await tx.language.update({ where: { id }, data: { isActive: active }, select: languageSelect });
      await this.audit.recordPlatformEvent(platform, { entityType: 'language', entityId: id, action: active ? 'language.activated' : 'language.deactivated', before, after }, tx);
      return after;
    });
  }

  private normalizeCode(value: string) {
    const trimmed = value.trim();
    if (!LANGUAGE_CODE_PATTERN.test(trimmed)) throw new BadRequestException('Language code is invalid');
    try { return Intl.getCanonicalLocales(trimmed)[0]; } catch { throw new BadRequestException('Language code is invalid'); }
  }
  private required(value: string, field: string) { const result = value.trim(); if (!result) throw new BadRequestException(`Language ${field} is required`); return result; }
  private rethrowConflict(error: unknown): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Language code already exists'); throw error; }
}
