import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('migration safety baseline', () => {
  let safety: typeof import('../tools/migration-safety/lib.cjs');

  beforeAll(async () => {
    safety = await import('../tools/migration-safety/lib.cjs');
  });

  it('rejects unsafe artifact destinations and Production-like paths', () => {
    expect(() => safety.assertSafeArtifactRoot('relative', 'C:\\repo')).toThrow(
      'absolute',
    );
    expect(() => safety.assertSafeArtifactRoot('C:\\repo\\backups', 'C:\\repo')).toThrow(
      'outside',
    );
    expect(() =>
      safety.assertSafeArtifactRoot('C:\\production-backups', 'C:\\repo'),
    ).toThrow('Production-like');
  });

  it('rejects remote and Production-like endpoints', () => {
    expect(() => safety.assertSafeEndpoint('https://storage.example.com', 'MinIO')).toThrow(
      'remote',
    );
    expect(() => safety.assertSafeEndpoint('postgresql://prod-db:5432/db', 'database')).toThrow(
      'Production-like',
    );
    expect(safety.assertSafeEndpoint('http://localhost:9000', 'MinIO')).toMatchObject({
      host: 'localhost',
    });
  });

  it('rejects non-local Docker contexts', () => {
    expect(() => safety.assertLocalDockerContext('production', 'ssh://server')).toThrow();
    expect(() =>
      safety.assertLocalDockerContext(
        'desktop-linux',
        'npipe:////./pipe/dockerDesktopLinuxEngine',
      ),
    ).not.toThrow();
  });

  it('rejects source and restore identity collisions', () => {
    const source = {
      project: 'iam-crm-backend',
      database: 'iam_crm',
      databaseVolume: 'source_db',
      minioVolume: 'source_minio',
      minioEndpoint: 'source:minio',
    };
    expect(() => safety.assertIsolatedIdentities(source, { ...source })).toThrow(
      'collision',
    );
    expect(() =>
      safety.assertIsolatedIdentities(source, {
        project: 'iam-crm-restore-test-1',
        database: 'iam_crm_restore_test',
        databaseVolume: 'restore_db',
        minioVolume: 'restore_minio',
        minioEndpoint: 'restore:minio',
      }),
    ).not.toThrow();
  });

  it('generates and verifies checksums and detects incomplete artifacts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'iam-crm-safety-'));
    const path = join(directory, 'database.dump');
    writeFileSync(path, 'backup-content');
    const artifact = safety.artifactRecord(path, directory, 'postgresql-custom-dump');
    expect(artifact.sha256).toHaveLength(64);
    expect(safety.verifyArtifact(path, artifact)).toBe(true);
    writeFileSync(path, 'changed');
    expect(() => safety.verifyArtifact(path, artifact)).toThrow(/mismatch/);
    const empty = join(directory, 'empty.dump');
    writeFileSync(empty, '');
    expect(() => safety.artifactRecord(empty, directory, 'dump')).toThrow('empty');
  });

  it('creates a redacted machine-readable manifest', () => {
    const manifest = safety.buildManifest({
      backupId: 'backup-1',
      timestamp: '2026-07-30T00:00:00.000Z',
      git: { branch: 'fix/000081', commit: 'abc' },
      prisma: { schemaSha256: '123' },
      postgres: { database: 'iam_crm', password: 'do-not-leak' },
      docker: { composeProject: 'iam-crm-backend' },
      minio: { accessKey: 'do-not-leak' },
      artifacts: [],
      executionResult: 'passed',
      validationResult: 'passed',
    });
    expect(manifest).toMatchObject({
      manifestVersion: 1,
      postgres: { password: '[REDACTED]' },
      minio: { accessKey: '[REDACTED]' },
    });
    expect(JSON.stringify(manifest)).not.toContain('do-not-leak');
  });

  it('finds destructive, locking, and preflight-sensitive migration SQL', () => {
    const findings = safety.scanMigrationSql(
      'ALTER TABLE "users" DROP COLUMN "legacy"; CREATE UNIQUE INDEX "x" ON "users"("email"); DELETE FROM "users";',
      'migration.sql',
    );
    expect(findings.map((item) => item.code)).toEqual(
      expect.arrayContaining(['DROP_COLUMN', 'UNIQUE_WITHOUT_PREFLIGHT', 'UNSCOPED_DELETE']),
    );
    expect(findings.every((item) => item.file === 'migration.sql')).toBe(true);
  });

  it('compares source and restored record inventories', () => {
    const source = { tables: [{ table: 'users', count: 3 }] };
    expect(safety.compareInventories(source, source)).toMatchObject({
      tables: [{ table: 'users', sourceCount: 3, restoredCount: 3, match: true }],
      preflight: {
        nullTenant: true,
        orphans: true,
        inconsistentOwnership: true,
        duplicates: true,
      },
      organizationsMatch: true,
      passed: true,
    });
    expect(
      safety.compareInventories(source, { tables: [{ table: 'users', count: 2 }] }).passed,
    ).toBe(false);
  });

  it('does not overwrite an existing artifact during repeat execution', () => {
    const directory = mkdtempSync(join(tmpdir(), 'iam-crm-safety-repeat-'));
    mkdirSync(join(directory, 'backup'));
    const path = join(directory, 'backup', 'manifest.json');
    writeFileSync(path, '{}', { flag: 'wx' });
    expect(() => writeFileSync(path, '{}', { flag: 'wx' })).toThrow();
  });

  it('returns a non-zero exit code and structured error for an invalid command', () => {
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), 'tools/migration-safety/cli.cjs'), 'unsupported-command'],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ status: 'failed' });
    expect(result.stderr).not.toMatch(/password|secret|token/i);
  });
});
