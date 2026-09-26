import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('fix 000086 Tenant-scoped Team code migration', () => {
  const root = join(__dirname, '..');

  it('enforces Tenant-qualified Team codes in the clean baseline', () => {
    const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
    const migration = readFileSync(
      join(
        root,
        'prisma/migrations/20260926000000_initial_content_intelligence_foundation/migration.sql',
      ),
      'utf8',
    );

    const team = schema.slice(schema.indexOf('model Team {'), schema.indexOf('model Organization {'));
    expect(team).toContain('@@unique([organizationId, code])');
    expect(team).toContain('organizationId String');
    expect(team).not.toContain('code        String  @unique');
    expect(team).not.toContain('organizationId String       @default');
    expect(migration).toContain('"teams_organizationId_code_key"');
    expect(migration).not.toContain('"teams_code_key"');
    expect(migration).not.toMatch(/^(INSERT|UPDATE|DELETE)\b/im);
  });

  it('uses Tenant-qualified runtime selectors without requiring a seeded Team', () => {
    const service = readFileSync(join(root, 'src/teams/teams.service.ts'), 'utf8');
    const seed = readFileSync(join(root, 'prisma/seed.ts'), 'utf8');

    expect(service).toContain('organizationId_code: { organizationId, code }');
    expect(seed).not.toContain('prisma.team');
    expect(service).not.toContain('findUnique({ where: { code } })');
  });
});
