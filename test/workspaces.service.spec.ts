import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, WorkspaceStatus } from '@prisma/client';
import { WorkspacesService } from '../src/workspaces/workspaces.service';
import type { TenantContext } from '../src/common/tenant/tenant-context.types';

type WorkspaceRow = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  status: WorkspaceStatus;
  settings: Record<string, never>;
  defaultLanguageCode: string | null;
  timezone: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const tenant = (organizationId: string, permissions: string[] = []): TenantContext => ({
  tenantId: organizationId,
  organizationId,
  userId: `user-${organizationId}`,
  membershipId: `membership-${organizationId}`,
  tenantRole: 'CUSTOM_WORKSPACE_ROLE',
  permissions,
  platformAdmin: false,
  membershipStatus: 'active',
  resolutionSource: 'token-session',
  requestId: `request-${organizationId}`,
});

function matches(row: WorkspaceRow, where: any): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.organizationId !== undefined && row.organizationId !== where.organizationId) return false;
  if (where.status !== undefined && row.status !== where.status) return false;
  if (where.OR) {
    const search = where.OR[0]?.name?.contains ?? where.OR[1]?.code?.contains;
    if (search && !`${row.name} ${row.code}`.toLowerCase().includes(search.toLowerCase())) return false;
  }
  return true;
}

function harness(initial: Partial<WorkspaceRow>[] = []) {
  let sequence = 0;
  const rows: WorkspaceRow[] = initial.map((row) => ({
    id: row.id ?? `workspace-${++sequence}`,
    organizationId: row.organizationId ?? 'org-a',
    name: row.name ?? 'Workspace',
    code: row.code ?? `WORKSPACE_${sequence}`,
    status: row.status ?? WorkspaceStatus.ACTIVE,
    settings: {},
    defaultLanguageCode: row.defaultLanguageCode ?? null,
    timezone: row.timezone ?? 'Asia/Tehran',
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt ?? new Date('2026-01-01T00:00:00Z'),
    updatedAt: row.updatedAt ?? new Date('2026-01-01T00:00:00Z'),
  }));
  const auditLog = { create: jest.fn().mockResolvedValue({ id: 'audit' }) };
  const workspace = {
    create: jest.fn(async ({ data }: any) => {
      if (rows.some((row) => row.organizationId === data.organizationId && row.code === data.code)) {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '5.22.0',
          meta: { target: ['organizationId', 'code'] },
        });
      }
      const now = new Date('2026-01-02T00:00:00Z');
      const row: WorkspaceRow = {
        id: `workspace-${++sequence}`,
        organizationId: data.organizationId,
        name: data.name,
        code: data.code,
        status: WorkspaceStatus.ACTIVE,
        settings: {},
        defaultLanguageCode: data.defaultLanguageCode ?? null,
        timezone: data.timezone,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(row);
      return { ...row };
    }),
    findMany: jest.fn(async ({ where, skip, take }: any) =>
      rows.filter((row) => matches(row, where)).slice(skip, skip + take).map((row) => ({ ...row })),
    ),
    count: jest.fn(async ({ where }: any) => rows.filter((row) => matches(row, where)).length),
    findFirst: jest.fn(async ({ where }: any) => {
      const row = rows.find((candidate) => matches(candidate, where));
      return row ? { ...row } : null;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const affected = rows.filter((row) => matches(row, where));
      for (const row of affected) Object.assign(row, data, { updatedAt: new Date('2026-01-03T00:00:00Z') });
      return { count: affected.length };
    }),
  };
  const tx: any = { workspace, auditLog };
  const prisma: any = {
    withTenantTransaction: jest.fn(async (_tenant, callback) => callback(tx)),
  };
  const audit: any = {
    recordTenantEvent: jest.fn(async (input, db) => db.auditLog.create({ data: input })),
  };
  return { rows, workspace, tx, prisma, audit, service: new WorkspacesService(prisma, audit) };
}

describe('WorkspacesService', () => {
  it('creates a tenant-owned Workspace with canonical code and language', async () => {
    const { service, audit } = harness();
    const created = await service.create(
      { name: '  Technology Intelligence  ', code: 'tech-intel', defaultLanguageCode: 'FA-ir' },
      tenant('org-a'),
    );

    expect(created).toMatchObject({
      organizationId: 'org-a',
      name: 'Technology Intelligence',
      code: 'TECH_INTEL',
      status: WorkspaceStatus.ACTIVE,
      defaultLanguageCode: 'fa-IR',
      timezone: 'Asia/Tehran',
    });
    expect(audit.recordTenantEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'workspace.created', organizationId: 'org-a' }),
      expect.any(Object),
    );
    expect(audit.recordTenantEvent.mock.calls[0][0].after).not.toHaveProperty('settings');
  });

  it('rejects an empty normalized code', async () => {
    const { service } = harness();
    await expect(service.create({ name: 'Name', code: '---' }, tenant('org-a'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an invalid timezone even when the service is called directly', async () => {
    const { service } = harness();
    await expect(
      service.create({ name: 'Name', code: 'workspace', timezone: 'Mars/Olympus' }, tenant('org-a')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate code within a Tenant and allows it across Tenants', async () => {
    const { service } = harness();
    await service.create({ name: 'A', code: 'technology' }, tenant('org-a'));
    await expect(service.create({ name: 'A2', code: 'TECHNOLOGY' }, tenant('org-a'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.create({ name: 'B', code: 'technology' }, tenant('org-b'))).resolves.toMatchObject({
      organizationId: 'org-b',
      code: 'TECHNOLOGY',
    });
  });

  it('lists only active Workspaces in the current Tenant by default', async () => {
    const { service } = harness([
      { id: 'a-active', organizationId: 'org-a', status: WorkspaceStatus.ACTIVE },
      { id: 'a-archived', organizationId: 'org-a', status: WorkspaceStatus.ARCHIVED },
      { id: 'b-active', organizationId: 'org-b', status: WorkspaceStatus.ACTIVE },
    ]);
    const result = await service.findAll({}, tenant('org-a'));
    expect(result.data.map((row) => row.id)).toEqual(['a-active']);
    expect(result.meta.total).toBe(1);
  });

  it('supports archived status filtering, search, and pagination', async () => {
    const { service } = harness([
      { id: 'a1', organizationId: 'org-a', name: 'Cyber One', code: 'CYBER_ONE', status: WorkspaceStatus.ARCHIVED },
      { id: 'a2', organizationId: 'org-a', name: 'Other', code: 'OTHER', status: WorkspaceStatus.ARCHIVED },
    ]);
    const result = await service.findAll(
      { status: WorkspaceStatus.ARCHIVED, search: 'cyber', page: 1, limit: 1 },
      tenant('org-a'),
    );
    expect(result.data.map((row) => row.id)).toEqual(['a1']);
    expect(result.meta).toMatchObject({ total: 1, page: 1, limit: 1 });
  });

  it.each(['findOne', 'update', 'archive'] as const)(
    'does not expose or mutate another Tenant through %s',
    async (operation) => {
      const { service, rows, workspace, audit } = harness([
        { id: 'workspace-b', organizationId: 'org-b', name: 'Tenant B' },
      ]);
      const call =
        operation === 'findOne'
          ? service.findOne('workspace-b', tenant('org-a'))
          : operation === 'update'
            ? service.update('workspace-b', { name: 'Leaked' }, tenant('org-a'))
            : service.archive('workspace-b', tenant('org-a'));
      await expect(call).rejects.toBeInstanceOf(NotFoundException);
      expect(rows[0]).toMatchObject({ name: 'Tenant B', status: WorkspaceStatus.ACTIVE });
      expect(workspace.updateMany).not.toHaveBeenCalled();
      expect(audit.recordTenantEvent).not.toHaveBeenCalled();
    },
  );

  it('keeps isolation when Tenant direction is reversed', async () => {
    const { service } = harness([{ id: 'workspace-a', organizationId: 'org-a' }]);
    await expect(service.findOne('workspace-a', tenant('org-b'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates only mutable fields and audits a bounded snapshot', async () => {
    const { service, rows, audit } = harness([{ id: 'workspace-a', organizationId: 'org-a' }]);
    const updated = await service.update(
      'workspace-a',
      { name: 'Updated', timezone: 'Europe/London', defaultLanguageCode: null },
      tenant('org-a'),
    );
    expect(updated).toMatchObject({ id: 'workspace-a', name: 'Updated', code: rows[0].code, timezone: 'Europe/London' });
    expect(audit.recordTenantEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'workspace.updated', entityId: 'workspace-a' }),
      expect.any(Object),
    );
  });

  it('archives without deleting and excludes the Workspace from the default list', async () => {
    const { service, rows, audit } = harness([{ id: 'workspace-a', organizationId: 'org-a' }]);
    const archived = await service.archive('workspace-a', tenant('org-a'));
    expect(archived.status).toBe(WorkspaceStatus.ARCHIVED);
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(rows).toHaveLength(1);
    expect((await service.findAll({}, tenant('org-a'))).data).toHaveLength(0);
    expect(audit.recordTenantEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'workspace.archived' }),
      expect.any(Object),
    );
  });

  it('does not update an archived Workspace', async () => {
    const { service } = harness([{ id: 'workspace-a', organizationId: 'org-a', status: WorkspaceStatus.ARCHIVED }]);
    await expect(service.update('workspace-a', { name: 'Changed' }, tenant('org-a'))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
