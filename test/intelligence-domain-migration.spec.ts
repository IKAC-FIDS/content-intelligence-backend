import fs from 'node:fs';
import path from 'node:path';

describe('Dynamic Intelligence Domain migration', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'prisma/migrations/20260930000000_dynamic_intelligence_domains/migration.sql'), 'utf8');
  it('creates a global catalog and explicit Workspace relation', () => {
    expect(sql).toContain('CREATE TABLE "intelligence_domains"');
    expect(sql).toContain('CREATE TABLE "workspace_domains"');
    expect(sql).toContain('PRIMARY KEY ("workspaceId", "domainId")');
    expect(sql).toContain('ON DELETE RESTRICT');
  });
  it('is additive and does not touch OrganizationDomain, CRM, Language, or Topic structures', () => {
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)|TRUNCATE/i);
    expect(sql).not.toMatch(/organization_domains|languages|topics|crm/i);
  });
});
