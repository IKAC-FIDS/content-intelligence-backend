import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkspaceStatus } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import { PrismaService, TenantTransactionClient } from '../prisma/prisma.service';
import { CreateWorkspaceDto, WORKSPACE_LANGUAGE_CODE_PATTERN } from './dto/create-workspace.dto';
import { FindWorkspacesDto } from './dto/find-workspaces.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

const workspaceSelect = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  status: true,
  settings: true,
  defaultLanguageCode: true,
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
        const workspace = await tx.workspace.create({
          data: {
            organizationId: tenant.organizationId,
            name: this.requiredName(dto.name),
            code: this.normalizeCode(dto.code),
            defaultLanguageCode: this.normalizeLanguage(dto.defaultLanguageCode),
            timezone: this.normalizeTimezone(dto.timezone ?? 'Asia/Tehran'),
          },
          select: workspaceSelect,
        });
        await this.recordAudit(tx, tenant, 'workspace.created', workspace.id, undefined, workspace);
        return workspace;
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
        data,
        meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 },
      };
    });
  }

  findOne(id: string, tenant: TenantContext) {
    return this.prisma.withTenantTransaction(tenant, (tx) => this.getScoped(tx, id, tenant));
  }

  update(id: string, dto: UpdateWorkspaceDto, tenant: TenantContext) {
    return this.prisma.withTenantTransaction(tenant, async (tx) => {
      const current = await this.getScoped(tx, id, tenant);
      if (current.status === WorkspaceStatus.ARCHIVED) {
        throw new ConflictException('Archived Workspace cannot be updated');
      }
      const data: Prisma.WorkspaceUpdateManyMutationInput = {};
      if (dto.name !== undefined) data.name = this.requiredName(dto.name);
      if (dto.defaultLanguageCode !== undefined) {
        data.defaultLanguageCode = this.normalizeLanguage(dto.defaultLanguageCode);
      }
      if (dto.timezone !== undefined) data.timezone = this.normalizeTimezone(dto.timezone);
      await tx.workspace.updateMany({
        where: { id, organizationId: tenant.organizationId, status: WorkspaceStatus.ACTIVE },
        data,
      });
      const updated = await this.getScoped(tx, id, tenant);
      await this.recordAudit(tx, tenant, 'workspace.updated', id, current, updated);
      return updated;
    });
  }

  archive(id: string, tenant: TenantContext) {
    return this.prisma.withTenantTransaction(tenant, async (tx) => {
      const current = await this.getScoped(tx, id, tenant);
      if (current.status === WorkspaceStatus.ARCHIVED) return current;
      await tx.workspace.updateMany({
        where: { id, organizationId: tenant.organizationId, status: WorkspaceStatus.ACTIVE },
        data: { status: WorkspaceStatus.ARCHIVED, archivedAt: new Date() },
      });
      const archived = await this.getScoped(tx, id, tenant);
      await this.recordAudit(tx, tenant, 'workspace.archived', id, current, archived);
      return archived;
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
    before?: { name: string; code: string; status: WorkspaceStatus; defaultLanguageCode: string | null; timezone: string },
    after?: { name: string; code: string; status: WorkspaceStatus; defaultLanguageCode: string | null; timezone: string },
  ) {
    const snapshot = (value: typeof before) => value && ({
      name: value.name,
      code: value.code,
      status: value.status,
      defaultLanguageCode: value.defaultLanguageCode,
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

  private normalizeLanguage(value: string | null | undefined) {
    if (value == null) return null;
    const normalized = value.trim();
    if (!WORKSPACE_LANGUAGE_CODE_PATTERN.test(normalized)) {
      throw new BadRequestException('Workspace default language code is invalid');
    }
    const parts = normalized.split('-');
    return parts
      .map((part, index) => {
        if (index === 0) return part.toLowerCase();
        if (part.length === 4) return `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`;
        if (part.length === 2) return part.toUpperCase();
        return part.toLowerCase();
      })
      .join('-');
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
