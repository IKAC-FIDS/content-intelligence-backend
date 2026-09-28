import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Dynamic Language migration', () => {
  const sql = readFileSync(join(process.cwd(), 'prisma/migrations/20260929000000_dynamic_languages/migration.sql'), 'utf8');
  it('creates normalized catalog and separate Workspace input/output relations', () => {
    expect(sql).toContain('CREATE TABLE "languages"');
    expect(sql).toContain('CREATE TABLE "workspace_input_languages"');
    expect(sql).toContain('CREATE TABLE "workspace_output_languages"');
    expect(sql).toContain('languages_code_normalized_key');
  });
  it('backfills the old scalar and contains no destructive operations', () => {
    expect(sql).toContain('UPDATE "workspaces"');
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE|DROP SCHEMA/i);
    expect(sql).not.toMatch(/CREATE TABLE "(?:domains|topics|keywords|entities|people|sources|contents)"/i);
  });
});
