const fs = require('node:fs');
const path = require('node:path');

const input = process.argv[2] ?? 'openapi/openapi.json';
const document = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), input), 'utf8').replace(/^\uFEFF/, ''));
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
const rows = [];

for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!methods.has(method)) continue;
    for (const [status, response] of Object.entries(operation.responses ?? {})) {
      if (!/^2\d\d$/.test(status)) continue;
      const schema = response.content?.['application/json']?.schema;
      rows.push({ method: method.toUpperCase(), route, status, kind: classify(schema, document) });
    }
  }
}

const counts = Object.fromEntries(['TYPED', 'GENERIC', 'NO_CONTENT', 'MISSING_SCHEMA'].map((kind) => [kind, rows.filter((row) => row.kind === kind).length]));
console.log(`TOTAL_SUCCESS_RESPONSES ${rows.length}`);
for (const [kind, count] of Object.entries(counts)) console.log(`${kind}_RESPONSES ${count}`);
for (const row of rows.filter((item) => item.kind === 'GENERIC')) console.log(`GENERIC_RESPONSE ${row.method} ${row.route} ${row.status}`);

function classify(schema, root) {
  if (!schema) return 'NO_CONTENT';
  const resolved = resolve(schema, root);
  if (!resolved || Object.keys(resolved).length === 0) return 'MISSING_SCHEMA';
  return containsGeneric(resolved, root, new Set()) ? 'GENERIC' : 'TYPED';
}

function resolve(schema, root) {
  if (!schema?.$ref) return schema;
  return schema.$ref.split('/').slice(1).reduce((value, key) => value?.[key], root);
}

function containsGeneric(schema, root, seen) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return false;
    seen.add(schema.$ref);
    return containsGeneric(resolve(schema, root), root, seen);
  }
  if (schema.type === 'object' && schema.additionalProperties === true) return true;
  return Object.values(schema).some((value) => Array.isArray(value)
    ? value.some((entry) => containsGeneric(entry, root, new Set(seen)))
    : containsGeneric(value, root, new Set(seen)));
}
