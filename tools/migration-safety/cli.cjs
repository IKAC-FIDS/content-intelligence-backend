#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statfsSync, writeFileSync } = require('node:fs');
const { basename, dirname, join, resolve } = require('node:path');
const {
  artifactRecord,
  assertIsolatedIdentities,
  assertLocalDockerContext,
  assertSafeArtifactRoot,
  buildManifest,
  compareInventories,
  scanMigrationSql,
  verifyArtifact,
} = require('./lib.cjs');

const repositoryRoot = resolve(__dirname, '../..');
const argv = process.argv.slice(2);
const command = argv.shift();
const options = parseOptions(argv);
const composeFile = resolve(options.composeFile ?? join(repositoryRoot, 'docker-compose.yml'));
const artifactRoot = resolve(options.artifactRoot ?? join(dirname(repositoryRoot), 'iam-crm-safety-artifacts'));

function parseOptions(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    parsed[key] = args[index + 1]?.startsWith('--') || args[index + 1] === undefined ? true : args[++index];
  }
  return parsed;
}

function run(program, args, settings = {}) {
  const result = spawnSync(program, args, {
    cwd: repositoryRoot,
    input: settings.input,
    encoding: settings.binary ? null : 'utf8',
    maxBuffer: 1024 * 1024 * 512,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr;
    throw new Error(`${program} failed (${result.status}): ${String(stderr ?? '').trim().slice(0, 1000)}`);
  }
  return result.stdout;
}

function dockerCompose(args, settings) {
  return run('docker', ['compose', '-f', composeFile, ...args], settings);
}

function jsonWrite(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

function safePreflight() {
  assertSafeArtifactRoot(artifactRoot, repositoryRoot);
  const context = String(run('docker', ['context', 'show'])).trim();
  const endpoint = String(run('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])).trim();
  assertLocalDockerContext(context, endpoint);
  const services = String(dockerCompose(['config', '--services'])).trim().split(/\r?\n/);
  for (const required of ['db', 'minio', 'api']) {
    if (!services.includes(required)) throw new Error(`Required Compose service is missing: ${required}`);
  }
  const project = String(dockerCompose(['ls', '--format', 'json']));
  const active = JSON.parse(project || '[]').find((item) => item.ConfigFiles?.split(',').some((file) => resolve(file) === composeFile));
  const projectName = options.sourceProject || active?.Name || basename(repositoryRoot).toLowerCase();
  if (/prod|production|live/i.test(projectName)) throw new Error('Production-like Compose project rejected');
  return { context, endpoint, services, projectName };
}

function containerName(service) {
  const id = String(dockerCompose(['ps', '-q', service])).trim();
  if (!id) throw new Error(`Compose service is not running: ${service}`);
  return String(run('docker', ['inspect', '--format', '{{.Name}}', id])).trim().replace(/^\//, '');
}

function containerEnv(container, key) {
  const env = JSON.parse(String(run('docker', ['inspect', '--format', '{{json .Config.Env}}', container])));
  const match = env.find((entry) => entry.startsWith(`${key}=`));
  if (!match) throw new Error(`Required ${key} is missing in ${container}`);
  return match.slice(key.length + 1);
}

function gitInfo() {
  return {
    commit: String(run('git', ['rev-parse', 'HEAD'])).trim(),
    branch: String(run('git', ['branch', '--show-current'])).trim(),
  };
}

function timestampId(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${createHash('sha256').update(String(process.hrtime.bigint())).digest('hex').slice(0, 8)}`;
}

function psql(container, user, database, sql) {
  return String(run('docker', ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database, '-At', '-c', sql])).trim();
}

function databaseInventory(container, user, database) {
  const tables = JSON.parse(psql(container, user, database, `SELECT COALESCE(json_agg(x ORDER BY x.table_name),'[]'::json)::text FROM (SELECT tablename AS table_name FROM pg_tables WHERE schemaname='public') x;`));
  const counts = tables.map(({ table_name: table }) => ({ table, count: Number(psql(container, user, database, `SELECT count(*) FROM public."${table.replaceAll('"', '""')}";`)) }));
  const tenantTables = JSON.parse(psql(container, user, database, `SELECT COALESCE(json_agg(x),'[]'::json)::text FROM (SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='organizationId') x;`));
  const nullTenant = tenantTables.map(({ table_name: table }) => ({ table, count: Number(psql(container, user, database, `SELECT count(*) FROM public."${table.replaceAll('"', '""')}" WHERE "organizationId" IS NULL;`)) }));
  const foreignKeys = JSON.parse(psql(container, user, database, `SELECT COALESCE(json_agg(x),'[]'::json)::text FROM (SELECT tc.constraint_name,tc.table_name,kcu.column_name,ccu.table_name AS foreign_table,ccu.column_name AS foreign_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema WHERE tc.constraint_schema='public' AND tc.constraint_type='FOREIGN KEY') x;`));
  const orphans = foreignKeys.map((fk) => ({ constraint: fk.constraint_name, table: fk.table_name, count: Number(psql(container, user, database, `SELECT count(*) FROM public."${fk.table_name}" c LEFT JOIN public."${fk.foreign_table}" p ON c."${fk.column_name}"=p."${fk.foreign_column}" WHERE c."${fk.column_name}" IS NOT NULL AND p."${fk.foreign_column}" IS NULL;`)) }));
  const tenantTableNames = new Set(tenantTables.map((item) => item.table_name));
  const inconsistentOwnership = foreignKeys.filter((fk) => tenantTableNames.has(fk.table_name) && tenantTableNames.has(fk.foreign_table)).map((fk) => ({ constraint: fk.constraint_name, table: fk.table_name, foreignTable: fk.foreign_table, count: Number(psql(container, user, database, `SELECT count(*) FROM public."${fk.table_name}" c JOIN public."${fk.foreign_table}" p ON c."${fk.column_name}"=p."${fk.foreign_column}" WHERE c."organizationId" IS DISTINCT FROM p."organizationId";`)) }));
  const uniqueIndexes = JSON.parse(psql(container, user, database, `SELECT COALESCE(json_agg(x),'[]'::json)::text FROM (SELECT i.relname AS index_name,t.relname AS table_name,array_agg(a.attname ORDER BY k.ordinality) AS columns,pg_get_expr(ix.indpred,ix.indrelid) AS predicate FROM pg_index ix JOIN pg_class t ON t.oid=ix.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_class i ON i.oid=ix.indexrelid JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY k(attnum,ordinality) ON true JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum WHERE n.nspname='public' AND ix.indisunique AND NOT ix.indisprimary GROUP BY i.relname,t.relname,ix.indpred,ix.indrelid) x;`));
  const duplicates = uniqueIndexes.map((item) => {
    const columns = item.columns.map((column) => `"${String(column).replaceAll('"', '""')}"`);
    const predicate = item.predicate ? ` WHERE ${item.predicate}` : '';
    return { index: item.index_name, table: item.table_name, columns: item.columns, predicate: item.predicate ?? null, count: Number(psql(container, user, database, `SELECT count(*) FROM (SELECT ${columns.join(',')} FROM public."${item.table_name}"${predicate} GROUP BY ${columns.join(',')} HAVING count(*)>1) d;`)) };
  });
  const organizationTable = counts.some((row) => row.table === 'organizations');
  const organizations = organizationTable ? JSON.parse(psql(container, user, database, `SELECT COALESCE(json_agg(x ORDER BY x."createdAt"),'[]'::json)::text FROM (SELECT id,code,name,status,"createdAt" FROM public.organizations) x;`)) : [];
  const organizationScopedTables = tenantTables.map((item) => item.table_name);
  const organizationOwnership = organizations.map((organization) => {
    const recordCounts = Object.fromEntries(organizationScopedTables.map((table) => [table, Number(psql(container, user, database, `SELECT count(*) FROM public."${table}" WHERE "organizationId"='${String(organization.id).replaceAll("'", "''")}';`))]));
    return { ...organization, recordCounts, totalAssignedRecords: Object.values(recordCounts).reduce((sum, count) => sum + count, 0) };
  });
  const populatedOrganizations = organizationOwnership.filter((item) => item.totalAssignedRecords > 0);
  const attachmentTable = counts.some((row) => row.table === 'file_attachments');
  const invalidAttachmentMetadata = attachmentTable ? {
    missingObjectKey: Number(psql(container, user, database, `SELECT count(*) FROM public.file_attachments WHERE "objectKey" IS NULL OR btrim("objectKey")='';`)),
    invalidSize: Number(psql(container, user, database, `SELECT count(*) FROM public.file_attachments WHERE "sizeBytes" < 0;`)),
    invalidSha256: Number(psql(container, user, database, `SELECT count(*) FROM public.file_attachments WHERE "sha256" !~ '^[0-9a-fA-F]{64}$';`)),
    minioMissingBucket: Number(psql(container, user, database, `SELECT count(*) FROM public.file_attachments WHERE "storageProvider"='MINIO' AND (bucket IS NULL OR btrim(bucket)='');`)),
  } : { skipped: true, reason: 'file_attachments table not present' };
  const attachmentObjects = attachmentTable ? JSON.parse(psql(container, user, database, `SELECT COALESCE(json_agg(x ORDER BY x."objectKey"),'[]'::json)::text FROM (SELECT id,bucket,"objectKey","sizeBytes",sha256 FROM public.file_attachments WHERE "storageProvider"='MINIO' AND "deletedAt" IS NULL) x;`)) : [];
  return { database, generatedAt: new Date().toISOString(), tables: counts, organizations: organizationOwnership, primaryExistingTenantCandidate: populatedOrganizations.length === 1 ? populatedOrganizations[0] : null, primaryTenantDecisionBasis: populatedOrganizations.length === 1 ? 'Only organization with existing organization-scoped CRM records; operator confirmation remains required before future tenant migration.' : 'Ambiguous; operator decision required.', nullTenant, orphans, inconsistentOwnership, duplicates, invalidAttachmentMetadata, attachmentObjects };
}

function mc(container, args, hostBackupDirectory) {
  const user = containerEnv(container, 'MINIO_ROOT_USER');
  const password = containerEnv(container, 'MINIO_ROOT_PASSWORD');
  const network = JSON.parse(String(run('docker', ['inspect', '--format', '{{json .NetworkSettings.Networks}}', container])));
  const networkName = Object.keys(network)[0];
  const script = `set -eu\nmc alias set source http://${container}:9000 '${user.replaceAll("'", "'\\''")}' '${password.replaceAll("'", "'\\''")}' >/dev/null\nmc ${args}\n`;
  const mount = hostBackupDirectory ? ['--mount', `type=bind,source=${resolve(hostBackupDirectory)},target=/backup`] : [];
  return String(run('docker', ['run', '--rm', '-i', '--network', networkName, ...mount, '--entrypoint', '/bin/sh', 'minio/mc:latest', '-s'], { input: script }));
}

function minioInventory(container, bucket) {
  const output = mc(container, `ls --recursive --json source/${bucket}`);
  const objects = output.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).map((item) => ({ key: item.key, size: Number(item.size), etag: item.etag ?? null, lastModified: item.lastModified ?? null }));
  return { bucket, objectCount: objects.length, totalBytes: objects.reduce((sum, item) => sum + item.size, 0), objects };
}

function waitForMinio(container) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      mc(container, 'ready source');
      return;
    } catch (error) {
      lastError = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
  }
  throw new Error(`Isolated MinIO did not become ready: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function fileArtifactsRecursively(directory, baseDirectory, type) {
  const artifacts = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) artifacts.push(...fileArtifactsRecursively(path, baseDirectory, type));
    else if (entry.isFile()) artifacts.push(artifactRecord(path, baseDirectory, type));
  }
  return artifacts;
}

function compareAttachmentObjects(database, minio) {
  const databaseByKey = new Map((database.attachmentObjects ?? []).map((item) => [item.objectKey, item]));
  const objectByKey = new Map(minio.objects.map((item) => [item.key, item]));
  const missingObjects = [...databaseByKey.keys()].filter((key) => !objectByKey.has(key));
  const orphanObjects = [...objectByKey.keys()].filter((key) => !databaseByKey.has(key));
  const sizeMismatches = [...databaseByKey.entries()].filter(([key, item]) => objectByKey.has(key) && Number(item.sizeBytes) !== Number(objectByKey.get(key).size)).map(([key]) => key);
  return { missingObjects, orphanObjects, sizeMismatches, passed: missingObjects.length === 0 && orphanObjects.length === 0 && sizeMismatches.length === 0 };
}

function scanMigrations() {
  const root = join(repositoryRoot, 'prisma', 'migrations');
  const findings = [];
  for (const directory of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, directory.name, 'migration.sql');
    if (directory.isDirectory() && existsSync(path)) findings.push(...scanMigrationSql(readFileSync(path, 'utf8'), `prisma/migrations/${directory.name}/migration.sql`));
  }
  const report = { generatedAt: new Date().toISOString(), scope: 'historical migrations', humanReviewRequired: true, provesSafety: false, findings };
  if (options.output) jsonWrite(resolve(options.output), report); else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function backup() {
  const preflight = safePreflight();
  const backupId = timestampId('iam-crm-backup');
  const directory = join(artifactRoot, backupId);
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', backupId, directory, preflight, wouldWrite: ['database.dump','minio-objects/*','config/*','inventory-source.json','migration-review.json','manifest.json'] }, null, 2)}\n`);
    return;
  }
  mkdirSync(artifactRoot, { recursive: true });
  const dbContainer = containerName('db');
  const minioContainer = containerName('minio');
  const dbUser = containerEnv(dbContainer, 'POSTGRES_USER');
  const database = containerEnv(dbContainer, 'POSTGRES_DB');
  const bucket = options.bucket || 'iam-crm-attachments';
  const objectInventory = minioInventory(minioContainer, bucket);
  const databaseBytes = Number(psql(dbContainer, dbUser, database, `SELECT pg_database_size(current_database());`));
  const requiredBytes = Math.max(100 * 1024 * 1024, (databaseBytes + objectInventory.totalBytes) * 2);
  const filesystem = statfsSync(artifactRoot);
  const freeBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
  if (freeBytes < requiredBytes) throw new Error(`Insufficient disk space: ${freeBytes} available, ${requiredBytes} required`);
  mkdirSync(directory, { recursive: false });
  const dumpPath = join(directory, 'database.dump');
  const dump = run('docker', ['exec', dbContainer, 'pg_dump', '-U', dbUser, '-d', database, '-Fc'], { binary: true });
  writeFileSync(dumpPath, dump, { flag: 'wx' });
  run('docker', ['exec', '-i', dbContainer, 'pg_restore', '--list'], { input: dump, binary: true });
  const inventory = databaseInventory(dbContainer, dbUser, database);
  inventory.minioRelationship = compareAttachmentObjects(inventory, objectInventory);
  const inventoryPath = join(directory, 'inventory-source.json');
  jsonWrite(inventoryPath, inventory);
  const minioInventoryPath = join(directory, 'minio-inventory-source.json');
  jsonWrite(minioInventoryPath, objectInventory);
  const minioObjectsDirectory = join(directory, 'minio-objects');
  mkdirSync(minioObjectsDirectory);
  mc(minioContainer, `mirror --preserve source/${bucket} /backup/${bucket}`, minioObjectsDirectory);
  const minioObjectArtifacts = fileArtifactsRecursively(minioObjectsDirectory, directory, 'minio-object');
  if (objectInventory.objectCount !== minioObjectArtifacts.length) throw new Error(`MinIO backup object-count mismatch: inventory=${objectInventory.objectCount}, copied=${minioObjectArtifacts.length}`);
  const configDirectory = join(directory, 'config');
  mkdirSync(configDirectory);
  const configArtifacts = [];
  const configurationNames = readdirSync(repositoryRoot).filter((name) => /^\.env(?:\..+)?$|^(?:docker-)?compose(?:\..+)?\.ya?ml$|^docker-compose(?:\..+)?\.ya?ml$|^nginx(?:\..+)?\.conf$/i.test(name));
  for (const name of configurationNames) {
    const source = join(repositoryRoot, name);
    if (existsSync(source)) {
      const target = join(configDirectory, name);
      copyFileSync(source, target);
      configArtifacts.push(artifactRecord(target, directory, 'configuration'));
    }
  }
  const scannerPath = join(directory, 'migration-review.json');
  options.output = scannerPath;
  const scanner = scanMigrations();
  const schemaPath = join(repositoryRoot, 'prisma', 'schema.prisma');
  const artifacts = [artifactRecord(dumpPath, directory, 'postgresql-custom-dump'), ...minioObjectArtifacts, artifactRecord(inventoryPath, directory, 'database-inventory'), artifactRecord(minioInventoryPath, directory, 'minio-inventory'), artifactRecord(scannerPath, directory, 'migration-review'), ...configArtifacts];
  const serverVersion = psql(dbContainer, dbUser, database, 'SHOW server_version;');
  const clientVersion = String(run('docker', ['exec', dbContainer, 'pg_dump', '--version'])).trim();
  const migrationStatus = String(dockerCompose(['exec', '-T', 'api', 'npx', 'prisma', 'migrate', 'status'])).replace(/postgresql:\/\/[^\s]+/g, '[REDACTED_DATABASE_URL]').trim();
  const manifest = buildManifest({ backupId, timestamp: new Date().toISOString(), git: gitInfo(), prisma: { schemaSha256: createHash('sha256').update(readFileSync(schemaPath)).digest('hex'), migrationStatus }, postgres: { database, hostClassification: 'local-docker-compose-service', serverVersion, clientVersion }, docker: { context: preflight.context, composeProject: preflight.projectName, services: preflight.services, images: { db: String(run('docker', ['inspect', '--format', '{{.Image}}', dbContainer])).trim(), minio: String(run('docker', ['inspect', '--format', '{{.Image}}', minioContainer])).trim() } }, minio: { ...objectInventory, objects: undefined }, artifacts, executionResult: 'passed', validationResult: { pgRestoreList: 'passed', checksums: 'generated', inventory: 'passed', migrationReview: scanner.findings.length ? 'human-review-required' : 'no-findings-human-review-still-required' } });
  jsonWrite(join(directory, 'manifest.json'), manifest);
  process.stdout.write(`${JSON.stringify({ status: 'passed', backupId, directory, manifest: join(directory, 'manifest.json') }, null, 2)}\n`);
}

function verify() {
  const directory = resolve(String(options.backup || ''));
  const manifestPath = join(directory, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error('Backup manifest is missing');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const artifact of manifest.artifacts ?? []) verifyArtifact(join(directory, artifact.fileName), artifact);
  const dump = readFileSync(join(directory, manifest.artifacts.find((item) => item.type === 'postgresql-custom-dump').fileName));
  const dbContainer = containerName('db');
  run('docker', ['exec', '-i', dbContainer, 'pg_restore', '--list'], { input: dump, binary: true });
  process.stdout.write(`${JSON.stringify({ status: 'passed', backupId: manifest.backupId, artifactCount: manifest.artifacts.length, checksums: 'passed', pgRestoreList: 'passed' }, null, 2)}\n`);
}

function inventory() {
  safePreflight();
  const dbContainer = containerName('db');
  const report = databaseInventory(dbContainer, containerEnv(dbContainer, 'POSTGRES_USER'), containerEnv(dbContainer, 'POSTGRES_DB'));
  if (options.output) jsonWrite(resolve(options.output), report); else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function restoreTest() {
  safePreflight();
  const backupDirectory = resolve(String(options.backup || ''));
  const manifest = JSON.parse(readFileSync(join(backupDirectory, 'manifest.json'), 'utf8'));
  for (const artifact of manifest.artifacts) verifyArtifact(join(backupDirectory, artifact.fileName), artifact);
  const suffix = timestampId('restore').replace('restore-', '').toLowerCase();
  const project = options.restoreProject || `iam-crm-restore-test-${suffix}`;
  const restoreFile = join(repositoryRoot, 'tools', 'migration-safety', 'restore-compose.yml');
  const source = { project: manifest.docker.composeProject, database: manifest.postgres.database, databaseVolume: `${manifest.docker.composeProject}_iam_crm_db_data`, minioVolume: `${manifest.docker.composeProject}_minio_data`, minioEndpoint: `${manifest.docker.composeProject}:minio` };
  const target = { project, database: 'iam_crm_restore_test', databaseVolume: `${project}_restore_db_data`, minioVolume: `${project}_restore_minio_data`, minioEndpoint: `${project}:restore-minio` };
  assertIsolatedIdentities(source, target);
  const identity = { source, target, cleanupCommand: `docker compose -p ${project} -f ${restoreFile} down` };
  process.stdout.write(`${JSON.stringify({ stage: 'validated-identities', ...identity }, null, 2)}\n`);
  if (options.dryRun) return;
  const composeArgs = ['compose', '-p', project, '-f', restoreFile];
  run('docker', [...composeArgs, 'up', '-d', 'restore-db', 'restore-minio']);
  let report;
  const reportPath = join(backupDirectory, `restore-test-${project}.json`);
  try {
    const dbId = String(run('docker', [...composeArgs, 'ps', '-q', 'restore-db'])).trim();
    const minioId = String(run('docker', [...composeArgs, 'ps', '-q', 'restore-minio'])).trim();
    const minioName = String(run('docker', ['inspect', '--format', '{{.Name}}', minioId])).trim().replace(/^\//, '');
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const ready = spawnSync('docker', ['exec', dbId, 'pg_isready', '-U', 'iam_crm_restore', '-d', target.database], { windowsHide: true });
      if (ready.status === 0) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
      if (attempt === 29) throw new Error('Isolated PostgreSQL did not become ready');
    }
    const dump = readFileSync(join(backupDirectory, manifest.artifacts.find((item) => item.type === 'postgresql-custom-dump').fileName));
    run('docker', ['exec', '-i', dbId, 'pg_restore', '-U', 'iam_crm_restore', '-d', target.database, '--clean', '--if-exists', '--no-owner', '--no-privileges'], { input: dump, binary: true });
    const restoredInventory = databaseInventory(dbId, 'iam_crm_restore', target.database);
    const sourceInventory = JSON.parse(readFileSync(join(backupDirectory, 'inventory-source.json'), 'utf8'));
    const comparison = compareInventories(sourceInventory, restoredInventory);
    waitForMinio(minioName);
    const minioObjectDirectory = join(backupDirectory, 'minio-objects');
    mc(minioName, `mb --ignore-existing source/${manifest.minio.bucket}`);
    mc(minioName, `mirror --preserve /backup/${manifest.minio.bucket} source/${manifest.minio.bucket}`, minioObjectDirectory);
    const restoredMinio = minioInventory(minioName, manifest.minio.bucket);
    const sourceMinio = JSON.parse(readFileSync(join(backupDirectory, 'minio-inventory-source.json'), 'utf8'));
    const stableObjects = (inventory) => inventory.objects.map((item) => ({ key: item.key, size: item.size, etag: item.etag ?? null })).sort((left, right) => left.key.localeCompare(right.key));
    const minioMatch = sourceMinio.objectCount === restoredMinio.objectCount && sourceMinio.totalBytes === restoredMinio.totalBytes && JSON.stringify(stableObjects(sourceMinio)) === JSON.stringify(stableObjects(restoredMinio));
    report = { generatedAt: new Date().toISOString(), identities: identity, postgres: { restored: true, comparison }, minio: { restored: true, sourceObjectCount: sourceMinio.objectCount, restoredObjectCount: restoredMinio.objectCount, sourceBytes: sourceMinio.totalBytes, restoredBytes: restoredMinio.totalBytes, match: minioMatch }, checksums: 'passed', cleanupStatus: options.cleanup === 'true' ? 'pending' : 'not-requested', passed: comparison.passed && minioMatch };
  } finally {
    if (options.cleanup === 'true') {
      process.stdout.write(`${JSON.stringify({ stage: 'cleanup-targets', project, containers: [`${project}-restore-db-1`, `${project}-restore-minio-1`], volumes: [target.databaseVolume, target.minioVolume] }, null, 2)}\n`);
      run('docker', [...composeArgs, 'down', '--volumes', '--remove-orphans']);
      if (report) report.cleanupStatus = 'passed';
    }
  }
  jsonWrite(reportPath, report);
  process.stdout.write(`${JSON.stringify({ status: report.passed ? 'passed' : 'failed', reportPath, ...report }, null, 2)}\n`);
  if (!report.passed) process.exitCode = 2;
}

try {
  if (command === 'scan-migrations') scanMigrations();
  else if (command === 'backup') backup();
  else if (command === 'verify') verify();
  else if (command === 'inventory') inventory();
  else if (command === 'restore-test') restoreTest();
  else throw new Error('Usage: cli.cjs <backup|verify|inventory|scan-migrations|restore-test> [options]');
} catch (error) {
  process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
}
