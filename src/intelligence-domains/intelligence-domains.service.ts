import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { PlatformScopeContext, TenantContext } from '../common/tenant/tenant-context.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIntelligenceDomainDto, FindIntelligenceDomainsDto, INTELLIGENCE_DOMAIN_CODE_PATTERN, UpdateIntelligenceDomainDto } from './dto/intelligence-domain.dto';

export const intelligenceDomainSelect = { id: true, code: true, name: true, description: true, isActive: true, createdAt: true, updatedAt: true } satisfies Prisma.IntelligenceDomainSelect;

@Injectable()
export class IntelligenceDomainsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  listSelectable(query: FindIntelligenceDomainsDto, _tenant: TenantContext) { return this.list({ ...query, isActive: true }); }
  listAdmin(query: FindIntelligenceDomainsDto, _platform: PlatformScopeContext) { return this.list(query); }

  private async list(query: FindIntelligenceDomainsDto) {
    const page = query.page ?? 1, limit = query.limit ?? 20, search = query.search?.trim();
    const where: Prisma.IntelligenceDomainWhereInput = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(search && { OR: [{ code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.intelligenceDomain.findMany({ where, select: intelligenceDomainSelect, orderBy: [{ name: 'asc' }, { code: 'asc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.intelligenceDomain.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return { data, meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 } };
  }

  async findOne(id: string, _platform: PlatformScopeContext) {
    const domain = await this.prisma.intelligenceDomain.findUnique({ where: { id }, select: intelligenceDomainSelect });
    if (!domain) throw new NotFoundException('Intelligence Domain not found');
    return domain;
  }

  async create(dto: CreateIntelligenceDomainDto, platform: PlatformScopeContext) {
    const code = this.normalizeCode(dto.code);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const domain = await tx.intelligenceDomain.create({ data: { code, name: this.required(dto.name), description: this.optional(dto.description) }, select: intelligenceDomainSelect });
        await this.audit.recordPlatformEvent(platform, { entityType: 'intelligence-domain', entityId: domain.id, action: 'intelligence-domain.created', after: domain }, tx);
        return domain;
      });
    } catch (error) { this.rethrowConflict(error); }
  }

  async update(id: string, dto: UpdateIntelligenceDomainDto, platform: PlatformScopeContext) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.intelligenceDomain.findUnique({ where: { id }, select: intelligenceDomainSelect });
      if (!before) throw new NotFoundException('Intelligence Domain not found');
      const after = await tx.intelligenceDomain.update({ where: { id }, data: { ...(dto.name !== undefined && { name: this.required(dto.name) }), ...(dto.description !== undefined && { description: this.optional(dto.description) }) }, select: intelligenceDomainSelect });
      await this.audit.recordPlatformEvent(platform, { entityType: 'intelligence-domain', entityId: id, action: 'intelligence-domain.updated', before, after }, tx);
      return after;
    });
  }

  setActive(id: string, active: boolean, platform: PlatformScopeContext) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.intelligenceDomain.findUnique({ where: { id }, select: intelligenceDomainSelect });
      if (!before) throw new NotFoundException('Intelligence Domain not found');
      if (before.isActive === active) return before;
      const after = await tx.intelligenceDomain.update({ where: { id }, data: { isActive: active }, select: intelligenceDomainSelect });
      await this.audit.recordPlatformEvent(platform, { entityType: 'intelligence-domain', entityId: id, action: active ? 'intelligence-domain.activated' : 'intelligence-domain.deactivated', before, after }, tx);
      return after;
    });
  }

  private normalizeCode(value: string) { const code = value.trim().toLowerCase().replace(/[\s_]+/g, '-'); if (!INTELLIGENCE_DOMAIN_CODE_PATTERN.test(code)) throw new BadRequestException('Intelligence Domain code is invalid'); return code; }
  private required(value: string) { const result = value.trim(); if (!result) throw new BadRequestException('Intelligence Domain name is required'); return result; }
  private optional(value: string | null | undefined) { const result = value?.trim(); return result || null; }
  private rethrowConflict(error: unknown): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Intelligence Domain code already exists'); throw error; }
}
