import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Workspace Core migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'prisma/migrations/20260928000000_workspace_core/migration.sql'),
    'utf8',
  );

  it('is additive and creates only the Workspace table and lifecycle enum', () => {
    expect([...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1])).toEqual(['workspaces']);
    expect(sql).toContain('CREATE TYPE "WorkspaceStatus"');
    expect(sql).not.toMatch(/DROP\s+(DATABASE|SCHEMA|TABLE)|TRUNCATE|DELETE\s+FROM|UPDATE\s+"/i);
  });

  it('enforces tenant ownership and tenant-qualified code uniqueness', () => {
    expect(sql).toContain('"workspaces_organizationId_code_key"');
    expect(sql).toContain('"workspaces_organizationId_status_idx"');
    expect(sql).toContain('REFERENCES "organizations"("id") ON DELETE RESTRICT');
  });

  it('does not introduce future Intelligence or CRM tables', () => {
    expect(sql).not.toMatch(/CREATE TABLE "(?:companies|opportunities|domains|topics|keywords|languages|entities|people|sources|monitoring_rules|contents)"/i);
  });
});
