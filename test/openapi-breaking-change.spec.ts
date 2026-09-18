import { readFileSync } from 'node:fs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const contract = JSON.parse(readFileSync('openapi/openapi.json', 'utf8'));

function removedOperations(base: any, candidate: any) {
  const removed: string[] = [];
  for (const [path, item] of Object.entries<any>(base.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) if (item[method] && !candidate.paths[path]?.[method]) removed.push(`${method.toUpperCase()} ${path}`);
  }
  return removed;
}

describe('breaking-change policy smoke', () => {
  it('detects a removed operation', () => {
    const candidate = structuredClone(contract);
    delete candidate.paths['/api/companies'].get;
    expect(removedOperations(contract, candidate)).toContain('GET /api/companies');
  });

  it('allows an additive operation', () => {
    const candidate = structuredClone(contract);
    candidate.paths['/api/example-additive'] = { get: { operationId: 'exampleAdditiveGet' } };
    expect(removedOperations(contract, candidate)).toEqual([]);
  });

  it('runs the installed standards-aware diff tool for compatible and breaking documents', () => {
    const directory = mkdtempSync(join(tmpdir(), 'iam-crm-openapi-'));
    const baseline = join(directory, 'baseline.json');
    const additive = join(directory, 'additive.json');
    const breaking = join(directory, 'breaking.json');
    const fixture = { openapi: '3.0.0', info: { title: 'Diff fixture', version: '1.0.0' }, paths: { '/items': { get: { operationId: 'itemsGet', responses: { '200': { description: 'ok' } } } } } };
    const additiveContract = structuredClone(fixture);
    additiveContract.paths['/example-additive'] = { get: { operationId: 'exampleAdditiveGet', responses: { '200': { description: 'ok' } } } };
    const breakingContract: any = structuredClone(fixture);
    delete breakingContract.paths['/items'].get;
    writeFileSync(baseline, JSON.stringify(fixture));
    writeFileSync(additive, JSON.stringify(additiveContract));
    writeFileSync(breaking, JSON.stringify(breakingContract));
    const cli = resolve('node_modules/openapi-diff/bin/openapi-diff');
    expect(spawnSync(process.execPath, [cli, 'baseline.json', 'additive.json'], { cwd: directory }).status).toBe(0);
    expect(spawnSync(process.execPath, [cli, 'baseline.json', 'breaking.json'], { cwd: directory }).status).not.toBe(0);
  }, 30_000);
});
