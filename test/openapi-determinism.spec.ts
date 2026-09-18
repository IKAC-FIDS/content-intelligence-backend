import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

describe('OpenAPI artifact determinism', () => {
  it('contains no nondeterministic build metadata or machine paths', () => {
    const artifact = readFileSync('openapi/openapi.json');
    const text = artifact.toString('utf8');
    expect(createHash('sha256').update(artifact).digest('hex')).toMatch(/^[a-f0-9]{64}$/);
    expect(text).not.toMatch(/[A-Z]:\\|\/Users\/|\/home\//);
    expect(text).not.toMatch(/buildTimestamp|APP_COMMIT_SHA/);
    expect(text).not.toMatch(/"generatedAt"\s*:\s*"\d{4}-\d{2}-\d{2}T/);
  });
});
