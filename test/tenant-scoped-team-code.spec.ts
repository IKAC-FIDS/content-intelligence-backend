import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('fix 000086 Tenant-scoped Team code migration', () => {
  const root = join(__dirname, '..');

  it('replaces global Team code uniqueness without assigning a default Tenant', () => {
    const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
    const migration = readFileSync(
      join(root, 'prisma/migrations/20260810143000_tenant_scoped_team_code/migration.sql'),
      'utf8',
    );

    const team = schema.slice(schema.indexOf('model Team {'), schema.indexOf('model Organization {'));
    expect(team).toContain('@@unique([organizationId, code])');
    expect(team).toContain('organizationId String');
    expect(team).not.toContain('code        String  @unique');
    expect(team).not.toContain('organizationId String       @default');
    expect(migration).toContain('DROP INDEX "teams_code_key"');
    expect(migration).toContain('"teams_organizationId_code_key"');
    expect(migration).not.toMatch(/UPDATE\s+"teams"/i);
  });

  it('uses Tenant-qualified runtime and seed selectors', () => {
    const service = readFileSync(join(root, 'src/teams/teams.service.ts'), 'utf8');
    const seed = readFileSync(join(root, 'prisma/seed.ts'), 'utf8');

    expect(service).toContain('organizationId_code: { organizationId, code }');
    expect(seed).toContain('organizationId_code:');
    expect(service).not.toContain('findUnique({ where: { code } })');
  });
});
