import {
  backfillTenantConstraints,
  inspectTenantConstraints,
  validateTenantConstraints,
} from '../src/tenant-constraints/tenant-constraints-maintenance';

function prismaWith(rows: unknown[] = []) {
  const defaults = [
    [{ tableName: 'organization_memberships' }],
    [{ count: 1n }],
    [{ count: 0n }],
    [{ count: 0n }],
    [{ count: 0n }],
    [{ count: 0n }],
    [],
    [],
    [{ indexname: 'teams_organizationId_code_key', indexdef: 'CREATE UNIQUE INDEX' }],
  ];
  const values = rows.length ? rows : defaults;
  return {
    $queryRaw: jest.fn().mockImplementation(() => Promise.resolve(values.shift())),
    $disconnect: jest.fn(),
  } as any;
}

describe('fix 000086 tenant constraint maintenance', () => {
  it('reports the proven Team ownership and excluded global candidates', async () => {
    const report = await inspectTenantConstraints(prismaWith());

    expect(report.status).toBe('ready');
    expect(report.teams).toMatchObject({
      total: 1,
      withOrganizationId: 1,
      withoutOrganizationId: 0,
      ambiguous: 0,
      duplicateTenantCodes: [],
    });
    expect(report.decisions.Team).toContain('Tenant-owned');
    expect(report.decisions.Role).toContain('Platform/global');
    expect(report.decisions.ProductCatalogItem).toContain('Platform/global');
  });

  it('keeps dry-run read-only and reports the required no-op backfill', async () => {
    const prisma = prismaWith();
    const result = await backfillTenantConstraints(prisma, {
      dryRun: true,
      confirmApply: false,
    });

    expect(result).toMatchObject({ status: 'ready', dryRun: true, updated: 0, unchanged: 1 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(9);
  });

  it('requires explicit confirmation for apply mode', async () => {
    await expect(
      backfillTenantConstraints(prismaWith(), { dryRun: false, confirmApply: false }),
    ).rejects.toThrow('Apply mode requires --confirm-apply');
  });

  it('blocks missing or ambiguous Team ownership instead of guessing', async () => {
    const prisma = prismaWith([
      [{ tableName: 'organization_memberships' }],
      [{ count: 2n }],
      [{ count: 1n }],
      [{ count: 0n }],
      [{ count: 0n }],
      [{ count: 0n }],
      [],
      [],
      [],
    ]);

    const result = await backfillTenantConstraints(prisma, {
      dryRun: false,
      confirmApply: true,
    });

    expect(result.status).toBe('blocked');
    expect(result.teams.ambiguous).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('blocks same-Tenant duplicate codes and cross-Tenant relations', async () => {
    const prisma = prismaWith([
      [{ tableName: 'organization_memberships' }],
      [{ count: 3n }],
      [{ count: 0n }],
      [{ count: 0n }],
      [{ count: 1n }],
      [{ count: 1n }],
      [{ code: 'SHARED', count: 2n }],
      [{ organizationId: 'tenant-a', code: 'SHARED', count: 2n }],
      [],
    ]);

    const result = await validateTenantConstraints(prisma);

    expect(result.status).toBe('failed');
    expect(result.blockingConflicts).toEqual(
      expect.arrayContaining([
        'cross-Tenant Team managers: 1',
        'cross-Tenant Membership teams: 1',
        'duplicate Tenant-scoped Team codes: 1',
      ]),
    );
  });

  it('supports preflight before the fix 000083 Membership migration', async () => {
    const prisma = prismaWith([
      [{ tableName: null }],
      [{ count: 1n }],
      [{ count: 0n }],
      [{ count: 0n }],
      [{ count: 0n }],
      [],
      [],
      [{ indexname: 'teams_code_key', indexdef: 'CREATE UNIQUE INDEX' }],
    ]);

    const report = await inspectTenantConstraints(prisma);

    expect(report.status).toBe('ready');
    expect(report.teams.membershipTableExists).toBe(false);
    expect(report.teams.crossTenantMemberships).toBe(0);
  });
});
