const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');

const baseline = process.argv[2];
const current = process.argv[3] || 'openapi/openapi.json';
if (!baseline || !existsSync(baseline) || !existsSync(current)) {
  process.stderr.write('Usage: node tools/openapi/check-breaking.cjs <baseline.json> [current.json]\n');
  process.exitCode = 2;
} else {
  const executable = process.platform === 'win32' ? 'openapi-diff.cmd' : 'openapi-diff';
  const result = spawnSync(executable, [baseline, current], { stdio: 'inherit', shell: false });
  process.exitCode = result.status ?? 1;
}
