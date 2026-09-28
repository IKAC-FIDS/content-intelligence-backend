import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { PlatformScopeContext, TenantContext } from '../common/tenant/tenant-context.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTopicDto, FindTopicsDto, TOPIC_CODE_PATTERN, TopicAliasInputDto, UpdateTopicDto } from './dto/topic.dto';

const topicSelect = {
  id: true, code: true, name: true, description: true, isActive: true, createdAt: true, updatedAt: true,
  domainLinks: { select: { domain: { select: { id: true, code: true, name: true, description: true, isActive: true } } }, orderBy: { domain: { name: 'asc' as const } } },
  aliases: { select: { id: true, value: true, normalizedValue: true, languageId: true, language: { select: { id: true, code: true, name: true, nativeName: true, direction: true, isActive: true } }, createdAt: true, updatedAt: true }, orderBy: { value: 'asc' as const } },
} satisfies Prisma.TopicSelect;

@Injectable()
export class TopicsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}
  listSelectable(query: FindTopicsDto, _tenant: TenantContext) { return this.list({ ...query, isActive: true }); }
  listAdmin(query: FindTopicsDto, _platform: PlatformScopeContext) { return this.list(query); }
  private async list(query: FindTopicsDto) {
    const page = query.page ?? 1, limit = query.limit ?? 20, search = query.search?.trim();
    const where: Prisma.TopicWhereInput = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.domainId && { domainLinks: { some: { domainId: query.domainId } } }),
      ...(search && { OR: [{ code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }, { aliases: { some: { value: { contains: search, mode: 'insensitive' } } } }] }),
    };
    const [rows, total] = await this.prisma.$transaction([this.prisma.topic.findMany({ where, select: topicSelect, orderBy: [{ name: 'asc' }, { code: 'asc' }], skip: (page - 1) * limit, take: limit }), this.prisma.topic.count({ where })]);
    const totalPages = Math.ceil(total / limit);
    return { data: rows.map((row) => this.present(row)), meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 } };
  }
  async findOne(id: string, _platform: PlatformScopeContext) { const row = await this.prisma.topic.findUnique({ where: { id }, select: topicSelect }); if (!row) throw new NotFoundException('Topic not found'); return this.present(row); }
  async create(dto: CreateTopicDto, platform: PlatformScopeContext) {
    try { return await this.prisma.$transaction(async (tx) => {
      const domainIds = await this.validateDomains(tx, dto.domainIds, []); const aliases = await this.validateAliases(tx, dto.aliases ?? [], []);
      const topic = await tx.topic.create({ data: { code: this.normalizeCode(dto.code), name: this.required(dto.name), description: this.optional(dto.description), domainLinks: { create: domainIds.map((domainId) => ({ domainId })) }, aliases: { create: aliases } }, select: topicSelect });
      const result = this.present(topic); await this.audit.recordPlatformEvent(platform, { entityType: 'topic', entityId: topic.id, action: 'topic.created', after: this.snapshot(result) }, tx); return result;
    }); } catch (error) { this.rethrowConflict(error); }
  }
  async update(id: string, dto: UpdateTopicDto, platform: PlatformScopeContext) {
    return this.prisma.$transaction(async (tx) => {
      const beforeRow = await tx.topic.findUnique({ where: { id }, select: topicSelect }); if (!beforeRow) throw new NotFoundException('Topic not found');
      const before = this.present(beforeRow); const existingDomains = before.domains.map((domain: any) => domain.id); const existingAliases = before.aliases.map((alias: any) => ({ normalizedValue: alias.normalizedValue, languageId: alias.languageId }));
      const domainIds = dto.domainIds === undefined ? existingDomains : await this.validateDomains(tx, dto.domainIds, existingDomains);
      const aliases = dto.aliases === undefined ? undefined : await this.validateAliases(tx, dto.aliases, existingAliases);
      if (dto.domainIds !== undefined) {
        const assignments = await tx.workspaceTopic.findMany({ where: { topicId: id }, select: { workspace: { select: { domainLinks: { select: { domainId: true } } } } } });
        const nextDomains = new Set(domainIds);
        if (assignments.some(({ workspace }) => workspace.domainLinks.length > 0 && !workspace.domainLinks.some(({ domainId }) => nextDomains.has(domainId)))) {
          throw new ConflictException('Topic Domain change would make an existing Workspace Topic assignment incompatible');
        }
      }
      await tx.topic.update({ where: { id }, data: { ...(dto.name !== undefined && { name: this.required(dto.name) }), ...(dto.description !== undefined && { description: this.optional(dto.description) }) } });
      if (dto.domainIds !== undefined) { await tx.topicDomain.deleteMany({ where: { topicId: id } }); if (domainIds.length) await tx.topicDomain.createMany({ data: domainIds.map((domainId) => ({ topicId: id, domainId })) }); }
      if (aliases !== undefined) { await tx.topicAlias.deleteMany({ where: { topicId: id } }); if (aliases.length) await tx.topicAlias.createMany({ data: aliases.map((alias) => ({ topicId: id, ...alias })) }); }
      const afterRow = await tx.topic.findUnique({ where: { id }, select: topicSelect }); const after = this.present(afterRow!);
      await this.audit.recordPlatformEvent(platform, { entityType: 'topic', entityId: id, action: 'topic.updated', before: this.snapshot(before), after: this.snapshot(after) }, tx); return after;
    });
  }
  setActive(id: string, active: boolean, platform: PlatformScopeContext) { return this.prisma.$transaction(async (tx) => { const beforeRow = await tx.topic.findUnique({ where: { id }, select: topicSelect }); if (!beforeRow) throw new NotFoundException('Topic not found'); if (beforeRow.isActive === active) return this.present(beforeRow); const afterRow = await tx.topic.update({ where: { id }, data: { isActive: active }, select: topicSelect }); const before = this.present(beforeRow), after = this.present(afterRow); await this.audit.recordPlatformEvent(platform, { entityType: 'topic', entityId: id, action: active ? 'topic.activated' : 'topic.deactivated', before: this.snapshot(before), after: this.snapshot(after) }, tx); return after; }); }
  private async validateDomains(tx: Prisma.TransactionClient, ids: string[], existingIds: string[]) { const unique = [...new Set(ids)]; if (unique.length !== ids.length) throw new BadRequestException('Duplicate Topic Domain association'); if (!unique.length) return unique; const rows = await tx.intelligenceDomain.findMany({ where: { id: { in: unique } }, select: { id: true, isActive: true } }); if (rows.length !== unique.length) throw new BadRequestException('Topic contains an unknown Intelligence Domain'); const existing = new Set(existingIds); if (rows.some((row) => !row.isActive && !existing.has(row.id))) throw new ConflictException('Inactive Intelligence Domain cannot be newly associated with Topic'); return unique; }
  private async validateAliases(tx: Prisma.TransactionClient, aliases: TopicAliasInputDto[], existing: Array<{ normalizedValue: string; languageId: string | null }>) { const normalized = aliases.map((alias) => ({ value: this.requiredAlias(alias.value), normalizedValue: this.normalizeAlias(alias.value), languageId: alias.languageId ?? null })); if (new Set(normalized.map((alias) => alias.normalizedValue)).size !== normalized.length) throw new BadRequestException('Duplicate Topic alias'); const languageIds = [...new Set(normalized.flatMap((alias) => alias.languageId ? [alias.languageId] : []))]; if (languageIds.length) { const rows = await tx.language.findMany({ where: { id: { in: languageIds } }, select: { id: true, isActive: true } }); if (rows.length !== languageIds.length) throw new BadRequestException('Topic alias contains an unknown Language'); const old = new Set(existing.map((alias) => `${alias.normalizedValue}:${alias.languageId ?? ''}`)); if (rows.some((row) => !row.isActive && normalized.some((alias) => alias.languageId === row.id && !old.has(`${alias.normalizedValue}:${row.id}`)))) throw new ConflictException('Inactive Language cannot be newly assigned to Topic alias'); } return normalized; }
  private present(row: any) { const { domainLinks, ...rest } = row; return { ...rest, domains: domainLinks.map((link: any) => link.domain) }; }
  private snapshot(topic: any) { return { code: topic.code, name: topic.name, description: topic.description, isActive: topic.isActive, domainIds: topic.domains.map((domain: any) => domain.id), aliases: topic.aliases.map((alias: any) => ({ value: alias.value, languageId: alias.languageId })) }; }
  private normalizeCode(value: string) { const code = value.trim().toLowerCase().replace(/[\s_]+/g, '-'); if (!TOPIC_CODE_PATTERN.test(code)) throw new BadRequestException('Topic code is invalid'); return code; }
  private normalizeAlias(value: string) { return value.trim().replace(/\s+/g, ' ').toLowerCase(); }
  private required(value: string) { const result = value.trim(); if (!result) throw new BadRequestException('Topic name is required'); return result; }
  private requiredAlias(value: string) { const result = value.trim().replace(/\s+/g, ' '); if (!result) throw new BadRequestException('Topic alias is required'); return result; }
  private optional(value: string | null | undefined) { const result = value?.trim(); return result || null; }
  private rethrowConflict(error: unknown): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Topic code or alias already exists'); throw error; }
}
