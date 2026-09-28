import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkspaceStatus } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import { PrismaService, TenantTransactionClient } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { FindWorkspacesDto } from './dto/find-workspaces.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

const workspaceSelect = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  status: true,
  settings: true,
  defaultLanguageId: true,
  defaultLanguage: { select: { id: true, code: true, name: true, nativeName: true, direction: true, isActive: true } },
  inputLanguageLinks: { select: { language: { select: { id: true, code: true, name: true, nativeName: true, direction: true, isActive: true } } }, orderBy: { language: { name: 'asc' as const } } },
  outputLanguageLinks: { select: { language: { select: { id: true, code: true, name: true, nativeName: true, direction: true, isActive: true } } }, orderBy: { language: { name: 'asc' as const } } },
  domainLinks: { select: { domain: { select: { id: true, code: true, name: true, description: true, isActive: true } } }, orderBy: { domain: { name: 'asc' as const } } },
  topicLinks: { select: { topic: { select: { id: true, code: true, name: true, description: true, isActive: true, domainLinks: { select: { domain: { select: { id: true, code: true, name: true, description: true, isActive: true } } } } } } }, orderBy: { topic: { name: 'asc' as const } } },
  timezone: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkspaceSelect;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  create(dto: CreateWorkspaceDto, tenant: TenantContext) {
    return this.prisma.withTenantTransaction(tenant, async (tx) => {
      try {
        await this.validateLanguageSelection(tx, dto.inputLanguageIds ?? [], [], 'input');
        await this.validateLanguageSelection(tx, dto.outputLanguageIds ?? [], [], 'output');
        await this.validateDomainSelection(tx, dto.domainIds ?? [], []);
        await this.validateTopicSelection(tx, dto.topicIds ?? [], [], dto.domainIds ?? []);
        this.validateDefault(dto.defaultLanguageId, dto.outputLanguageIds ?? []);
        const workspace = await tx.workspace.create({
          data: {
            organizationId: tenant.organizationId,
            name: this.requiredName(dto.name),
            code: this.normalizeCode(dto.code),
            defaultLanguageId: dto.defaultLanguageId,
            inputLanguageLinks: { create: (dto.inputLanguageIds ?? []).map((languageId) => ({ languageId })) },
            outputLanguageLinks: { create: (dto.outputLanguageIds ?? []).map((languageId) => ({ languageId })) },
            domainLinks: { create: (dto.domainIds ?? []).map((domainId) => ({ domainId })) },
            topicLinks: { create: (dto.topicIds ?? []).map((topicId) => ({ topicId })) },
            timezone: this.normalizeTimezone(dto.timezone ?? 'Asia/Tehran'),
          },
          select: workspaceSelect,
        });
        await this.recordAudit(tx, tenant, 'workspace.created', workspace.id, undefined, workspace);
        return this.present(workspace);
      } catch (error) {
        this.rethrowCodeConflict(error);
      }
    });
  }

  findAll(query: FindWorkspacesDto, tenant: TenantContext) {
    return this.prisma.withTenantTransaction(tenant, async (tx) => {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const search = query.search?.trim();
      const where: Prisma.WorkspaceWhereInput = {
        organizationId: tenant.organizationId,
        status: query.status ?? WorkspaceStatus.ACTIVE,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        }),
      };
      const [data, total] = await Promise.all([
        tx.workspace.findMany({
          where,
          select: workspaceSelect,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.workspace.count({ where }),
      ]);
      const totalPages = Math.ceil(total / limit);
      return {
        data: data.map((workspace) => this.present(workspace)),
        meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 },
      };
    });
  }

  findOne(id: string, tenant: TenantContext) {
    return this.prisma.withTenantTransaction(tenant, async (tx) => this.present(await this.getScoped(tx, id, tenant)));
  }

  update(id: string, dto: UpdateWorkspaceDto, tenant: TenantContext) {
    return this.prisma.withTenantTransaction(tenant, async (tx) => {
      const current = await this.getScoped(tx, id, tenant);
      if (current.status === WorkspaceStatus.ARCHIVED) {
        throw new ConflictException('Archived Workspace cannot be updated');
      }
      const data: Prisma.WorkspaceUncheckedUpdateManyInput = {};
      if (dto.name !== undefined) data.name = this.requiredName(dto.name);
      if (dto.timezone !== undefined) data.timezone = this.normalizeTimezone(dto.timezone);
      const currentInput = current.inputLanguageLinks.map((link) => link.language.id);
      const currentOutput = current.outputLanguageLinks.map((link) => link.language.id);
      const currentDomains = current.domainLinks.map((link) => link.domain.id);
      const currentTopics = current.topicLinks.map((link) => link.topic.id);
      const nextInput = dto.inputLanguageIds ?? currentInput;
      const nextOutput = dto.outputLanguageIds ?? currentOutput;
      const nextDefault = dto.defaultLanguageId !== undefined ? dto.defaultLanguageId : current.defaultLanguageId;
      const nextDomains = dto.domainIds ?? currentDomains;
      const nextTopics = dto.topicIds ?? currentTopics;
      if (dto.inputLanguageIds !== undefined) await this.validateLanguageSelection(tx, nextInput, currentInput, 'input');
      if (dto.outputLanguageIds !== undefined) await this.validateLanguageSelection(tx, nextOutput, currentOutput, 'output');
      if (dto.domainIds !== undefined) await this.validateDomainSelection(tx, dto.domainIds, currentDomains);
      if (dto.topicIds !== undefined || dto.domainIds !== undefined) await this.validateTopicSelection(tx, nextTopics, currentTopics, nextDomains);
      this.validateDefault(nextDefault, nextOutput);
      if (dto.defaultLanguageId !== undefined) data.defaultLanguageId = dto.defaultLanguageId;
      await tx.workspace.updateMany({
        where: { id, organizationId: tenant.organizationId, status: WorkspaceStatus.ACTIVE },
        data,
      });
      if (dto.inputLanguageIds !== undefined) {
        await tx.workspaceInputLanguage.deleteMany({ where: { workspaceId: id } });
        await tx.workspaceInputLanguage.createMany({ data: nextInput.map((languageId) => ({ workspaceId: id, languageId })) });
      }
      if (dto.outputLanguageIds !== undefined) {
        await tx.workspaceOutputLanguage.deleteMany({ where: { workspaceId: id } });
        await tx.workspaceOutputLanguage.createMany({ data: nextOutput.map((languageId) => ({ workspaceId: id, languageId })) });
      }
      if (dto.domainIds !== undefined) {
        await tx.workspaceDomain.deleteMany({ where: { workspaceId: id } });
        await tx.workspaceDomain.createMany({ data: dto.domainIds.map((domainId) => ({ workspaceId: id, domainId })) });
      }
      if (dto.topicIds !== undefined) {
        await tx.workspaceTopic.deleteMany({ where: { workspaceId: id } });
        if (nextTopics.length) await tx.workspaceTopic.createMany({ data: nextTopics.map((topicId) => ({ workspaceId: id, topicId })) });
      }
      const updated = await this.getScoped(tx, id, tenant);
      await this.recordAudit(tx, tenant, 'workspace.updated', id, current, updated);
      return this.present(updated);
    });
  }

  archive(id: string, tenant: TenantContext) {
    return this.prisma.withTenantTransaction(tenant, async (tx) => {
      const current = await this.getScoped(tx, id, tenant);
      if (current.status === WorkspaceStatus.ARCHIVED) return this.present(current);
      await tx.workspace.updateMany({
        where: { id, organizationId: tenant.organizationId, status: WorkspaceStatus.ACTIVE },
        data: { status: WorkspaceStatus.ARCHIVED, archivedAt: new Date() },
      });
      const archived = await this.getScoped(tx, id, tenant);
      await this.recordAudit(tx, tenant, 'workspace.archived', id, current, archived);
      return this.present(archived);
    });
  }

  private async getScoped(tx: TenantTransactionClient, id: string, tenant: TenantContext) {
    const workspace = await tx.workspace.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: workspaceSelect,
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  private recordAudit(
    tx: TenantTransactionClient,
    tenant: TenantContext,
    action: string,
    entityId: string,
    before?: any,
    after?: any,
  ) {
    const snapshot = (value: typeof before) => value && ({
      name: value.name,
      code: value.code,
      status: value.status,
      defaultLanguageId: value.defaultLanguageId,
      inputLanguageIds: value.inputLanguageLinks?.map((link: any) => link.language.id),
      outputLanguageIds: value.outputLanguageLinks?.map((link: any) => link.language.id),
      domainIds: value.domainLinks?.map((link: any) => link.domain.id),
      topicIds: value.topicLinks?.map((link: any) => link.topic.id),
      timezone: value.timezone,
    });
    return this.audit.recordTenantEvent({
      actorId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      organizationId: tenant.organizationId,
      requestId: tenant.requestId,
      entityType: 'workspace',
      entityId,
      action,
      before: snapshot(before),
      after: snapshot(after),
    }, tx);
  }

  private requiredName(value: string) {
    const name = value.trim();
    if (!name) throw new BadRequestException('Workspace name is required');
    return name;
  }

  private normalizeCode(value: string) {
    const code = value.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
    if (!code) throw new BadRequestException('Workspace code is required');
    return code;
  }

  private async validateLanguageSelection(tx: TenantTransactionClient, ids: string[], existingIds: string[], label: string) {
    const unique = [...new Set(ids)];
    if (unique.length !== ids.length) throw new BadRequestException(`Duplicate ${label} Language selection`);
    const found = await tx.language.findMany({ where: { id: { in: unique } }, select: { id: true, isActive: true } });
    if (found.length !== unique.length) throw new BadRequestException(`${label} Language selection contains an unknown Language`);
    const existing = new Set(existingIds);
    if (found.some((language) => !language.isActive && !existing.has(language.id))) throw new ConflictException(`Inactive Language cannot be added to Workspace ${label} languages`);
  }

  private validateDefault(defaultLanguageId: string | null | undefined, outputLanguageIds: string[]) {
    if (defaultLanguageId && !outputLanguageIds.includes(defaultLanguageId)) throw new BadRequestException('Default Language must belong to Workspace output languages');
  }

  private async validateDomainSelection(tx: TenantTransactionClient, ids: string[], existingIds: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length !== ids.length) throw new BadRequestException('Duplicate Intelligence Domain selection');
    if (unique.length === 0) return;
    const found = await tx.intelligenceDomain.findMany({ where: { id: { in: unique } }, select: { id: true, isActive: true } });
    if (found.length !== unique.length) throw new BadRequestException('Intelligence Domain selection contains an unknown Domain');
    const existing = new Set(existingIds);
    if (found.some((domain) => !domain.isActive && !existing.has(domain.id))) throw new ConflictException('Inactive Intelligence Domain cannot be added to Workspace');
  }

  private async validateTopicSelection(tx: TenantTransactionClient, ids: string[], existingIds: string[], workspaceDomainIds: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length !== ids.length) throw new BadRequestException('Duplicate Topic selection');
    if (!unique.length) return;
    const found = await tx.topic.findMany({ where: { id: { in: unique } }, select: { id: true, isActive: true, domainLinks: { select: { domainId: true } } } });
    if (found.length !== unique.length) throw new BadRequestException('Topic selection contains an unknown Topic');
    const existing = new Set(existingIds);
    if (found.some((topic) => !topic.isActive && !existing.has(topic.id))) throw new ConflictException('Inactive Topic cannot be added to Workspace');
    if (workspaceDomainIds.length) {
      const allowed = new Set(workspaceDomainIds);
      if (found.some((topic) => !topic.domainLinks.some((link) => allowed.has(link.domainId)))) throw new ConflictException('Each Workspace Topic must share at least one Workspace Domain');
    }
  }

  private present(workspace: any) {
    const { inputLanguageLinks, outputLanguageLinks, domainLinks, topicLinks, ...rest } = workspace;
    const topics = (topicLinks ?? []).map((link: any) => { const { domainLinks: topicDomains, ...topic } = link.topic; return { ...topic, domains: topicDomains.map((item: any) => item.domain) }; });
    return { ...rest, inputLanguages: inputLanguageLinks.map((link: any) => link.language), outputLanguages: outputLanguageLinks.map((link: any) => link.language), domains: (domainLinks ?? []).map((link: any) => link.domain), topics };
  }

  private normalizeTimezone(value: string) {
    const timezone = value.trim();
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('Workspace timezone must be a valid IANA timezone');
    }
    return timezone;
  }

  private rethrowCodeConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Workspace code already exists');
    }
    throw error;
  }
}
