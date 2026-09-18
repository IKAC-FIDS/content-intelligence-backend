const { createHash } = require('node:crypto');
const { readFileSync, statSync } = require('node:fs');
const { isAbsolute, relative, resolve } = require('node:path');

const MANIFEST_VERSION = 1;
const PRODUCTION_MARKERS = /\b(prod|production|live)\b|\/opt\/CRM/i;
const LOCAL_DOCKER_HOSTS = new Set(['db', 'minio', 'localhost', '127.0.0.1', '::1']);

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /password|secret|token|authorization|cookie|access.?key|private.?key|database.?url/i.test(key)
        ? '[REDACTED]'
        : redact(item),
    ]),
  );
}

function assertSafeArtifactRoot(root, repositoryRoot) {
  if (!root || !isAbsolute(root)) throw new Error('Backup destination must be an absolute path');
  const resolvedRoot = resolve(root);
  const resolvedRepo = resolve(repositoryRoot);
  if (resolvedRoot === resolvedRepo || !relative(resolvedRepo, resolvedRoot).startsWith('..')) {
    throw new Error('Backup destination must be outside the repository');
  }
  if (PRODUCTION_MARKERS.test(resolvedRoot)) throw new Error('Production-like backup destination rejected');
  return resolvedRoot;
}

function assertLocalDockerContext(name, endpoint) {
  if (!/desktop-linux|default/i.test(name ?? '')) throw new Error(`Non-local Docker context rejected: ${name || 'unknown'}`);
  if (!/npipe:|unix:\/\/\/var\/run\/docker\.sock/i.test(endpoint ?? '')) {
    throw new Error('Docker endpoint is not a recognized local engine');
  }
}

function assertSafeEndpoint(endpoint, label) {
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error(`${label} endpoint is missing or invalid`);
  }
  if (PRODUCTION_MARKERS.test(endpoint) || !LOCAL_DOCKER_HOSTS.has(parsed.hostname)) {
    throw new Error(`${label} endpoint is remote or Production-like`);
  }
  return { protocol: parsed.protocol, host: parsed.hostname, port: parsed.port || null };
}

function assertIsolatedIdentities(source, target) {
  const pairs = [
    ['Compose project', source.project, target.project],
    ['database', source.database, target.database],
    ['PostgreSQL volume', source.databaseVolume, target.databaseVolume],
    ['MinIO volume', source.minioVolume, target.minioVolume],
    ['MinIO endpoint', source.minioEndpoint, target.minioEndpoint],
  ];
  for (const [label, left, right] of pairs) {
    if (!left || !right) throw new Error(`${label} identity is ambiguous`);
    if (String(left).toLowerCase() === String(right).toLowerCase()) {
      throw new Error(`${label} source/restore identity collision`);
    }
  }
  if (PRODUCTION_MARKERS.test(target.project)) throw new Error('Production-like restore project rejected');
}

function sha256File(path) {
  const data = readFileSync(path);
  return createHash('sha256').update(data).digest('hex');
}

function artifactRecord(path, baseDirectory, type) {
  const stats = statSync(path);
  if (!stats.isFile() || stats.size <= 0) throw new Error(`Backup artifact is empty or invalid: ${path}`);
  return {
    type,
    fileName: relative(baseDirectory, path).replaceAll('\\', '/'),
    sizeBytes: stats.size,
    sha256: sha256File(path),
  };
}

function verifyArtifact(path, expected) {
  if (!expected?.sha256 || !expected?.sizeBytes) throw new Error('Artifact checksum metadata is incomplete');
  const actual = artifactRecord(path, resolve(path, '..'), expected.type ?? 'unknown');
  if (actual.sizeBytes !== expected.sizeBytes) throw new Error(`Artifact size mismatch: ${path}`);
  if (actual.sha256 !== expected.sha256) throw new Error(`Artifact checksum mismatch: ${path}`);
  return true;
}

const RULES = [
  ['critical', 'DROP_TABLE', /\bDROP\s+TABLE\b/i],
  ['critical', 'DROP_COLUMN', /\bDROP\s+COLUMN\b/i],
  ['critical', 'TRUNCATE', /\bTRUNCATE\b/i],
  ['critical', 'CASCADE', /\bCASCADE\b/i],
  ['high', 'UNSCOPED_DELETE', /\bDELETE\s+FROM\b(?![\s\S]*\bWHERE\b)/i],
  ['high', 'SET_NOT_NULL', /\bALTER\s+COLUMN\b[\s\S]*\bSET\s+NOT\s+NULL\b/i],
  ['high', 'COLUMN_TYPE_CHANGE', /\bALTER\s+COLUMN\b[\s\S]*\bTYPE\b/i],
  ['high', 'ENUM_CHANGE', /\bALTER\s+TYPE\b|\bDROP\s+TYPE\b|\bCREATE\s+TYPE\b/i],
  ['high', 'UNIQUE_WITHOUT_PREFLIGHT', /\bCREATE\s+UNIQUE\s+INDEX\b|\bADD\s+CONSTRAINT\b[\s\S]*\bUNIQUE\b/i],
  ['high', 'FOREIGN_KEY_WITHOUT_PREFLIGHT', /\bADD\s+CONSTRAINT\b[\s\S]*\bFOREIGN\s+KEY\b/i],
  ['medium', 'POTENTIAL_LARGE_UPDATE', /\bUPDATE\s+["\w.]+\s+SET\b/i],
  ['medium', 'BLOCKING_INDEX', /\bCREATE\s+(?!UNIQUE\s+)?INDEX\b(?![\s\S]*\bCONCURRENTLY\b)/i],
  ['medium', 'TABLE_REWRITE', /\bALTER\s+TABLE\b[\s\S]*(?:\bTYPE\b|\bSET\s+DATA\s+TYPE\b)/i],
  ['critical', 'RESET_COMMAND', /\bmigrate\s+reset\b|\bforce-reset\b|\bDROP\s+DATABASE\b|\bDROP\s+SCHEMA\b/i],
];

function scanMigrationSql(sql, file = 'migration.sql') {
  const statements = sql
    .split(/;(?=(?:[^']|'[^']*')*$)/g)
    .map((text) => text.trim())
    .filter(Boolean);
  const findings = [];
  for (const statement of statements) {
    const line = sql.slice(0, sql.indexOf(statement)).split(/\r?\n/).length;
    for (const [severity, code, pattern] of RULES) {
      if (pattern.test(statement)) {
        findings.push({ file, line, severity, code, context: statement.replace(/\s+/g, ' ').slice(0, 240) });
      }
    }
  }
  return findings;
}

function compareInventories(source, restored) {
  const targetByTable = new Map(restored.tables.map((row) => [row.table, row.count]));
  const tables = source.tables.map((row) => ({
    table: row.table,
    sourceCount: row.count,
    restoredCount: targetByTable.get(row.table) ?? null,
    match: targetByTable.get(row.table) === row.count,
  }));
  const stableRows = (rows, keys) => rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key] ?? null]))).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const preflight = {
    nullTenant: JSON.stringify(stableRows(source.nullTenant ?? [], ['table', 'count'])) === JSON.stringify(stableRows(restored.nullTenant ?? [], ['table', 'count'])),
    orphans: JSON.stringify(stableRows(source.orphans ?? [], ['constraint', 'table', 'count'])) === JSON.stringify(stableRows(restored.orphans ?? [], ['constraint', 'table', 'count'])),
    inconsistentOwnership: JSON.stringify(stableRows(source.inconsistentOwnership ?? [], ['constraint', 'table', 'foreignTable', 'count'])) === JSON.stringify(stableRows(restored.inconsistentOwnership ?? [], ['constraint', 'table', 'foreignTable', 'count'])),
    duplicates: JSON.stringify(stableRows(source.duplicates ?? [], ['index', 'table', 'count'])) === JSON.stringify(stableRows(restored.duplicates ?? [], ['index', 'table', 'count'])),
  };
  const organizationsMatch = JSON.stringify(stableRows(source.organizations ?? [], ['id', 'code', 'name', 'status'])) === JSON.stringify(stableRows(restored.organizations ?? [], ['id', 'code', 'name', 'status']));
  return { tables, preflight, organizationsMatch, passed: tables.every((row) => row.match) && Object.values(preflight).every(Boolean) && organizationsMatch };
}

function buildManifest(input) {
  return redact({
    manifestVersion: MANIFEST_VERSION,
    backupId: input.backupId,
    timestamp: input.timestamp,
    git: input.git,
    prisma: input.prisma,
    postgres: input.postgres,
    docker: input.docker,
    minio: input.minio,
    artifacts: input.artifacts,
    executionResult: input.executionResult,
    validationResult: input.validationResult,
  });
}

module.exports = {
  MANIFEST_VERSION,
  PRODUCTION_MARKERS,
  LOCAL_DOCKER_HOSTS,
  redact,
  assertSafeArtifactRoot,
  assertLocalDockerContext,
  assertSafeEndpoint,
  assertIsolatedIdentities,
  sha256File,
  artifactRecord,
  verifyArtifact,
  scanMigrationSql,
  compareInventories,
  buildManifest,
};
