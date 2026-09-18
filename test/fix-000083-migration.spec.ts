import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('fix 000083 additive migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260802150000_add_organization_memberships/migration.sql',
    ),
    'utf8',
  );

  it('adds only the Membership enum, table, constraints, and indexes', () => {
    expect(sql).toContain('CREATE TYPE "OrganizationMembershipStatus"');
    expect(sql).toContain('CREATE TABLE "organization_memberships"');
    expect(sql).toContain(
      'organization_memberships_userId_organizationId_key',
    );
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)/i);
    expect(sql).not.toMatch(/TRUNCATE|DELETE\s+FROM|UPDATE\s+"users"/i);
  });

  it('enforces one active default and rejects non-active defaults', () => {
    expect(sql).toContain(
      'WHERE "isDefault" = true AND "status" = \'ACTIVE\'',
    );
    expect(sql).toContain(
      'CHECK (NOT "isDefault" OR "status" = \'ACTIVE\')',
    );
    expect(sql).not.toContain('UNIQUE ("userId", "isDefault")');
  });

  it('preserves legacy User fields and ownership relations', () => {
    for (const field of [
      'organizationId',
      'role',
      'roleId',
      'team',
      'teamId',
    ]) {
      expect(sql).not.toContain(`DROP COLUMN "${field}"`);
    }
  });
});
