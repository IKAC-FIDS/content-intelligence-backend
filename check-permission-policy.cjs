const fs = require('fs');
const path = require('path');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (entry.isFile() && full.endsWith('.controller.ts')) return [full];
    return [];
  });
}

const files = walk(path.join(process.cwd(), 'src'));

const httpDecoratorRegex = /^\s*@(?:Get|Post|Patch|Put|Delete)\b/m;
const permissionRegex = /@Permissions\s*\(|@AnyPermission\s*\(/;
const classPermissionRegex = /@Permissions\s*\(|@AnyPermission\s*\(/;

let hasProblem = false;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');

  if (!content.includes('PermissionsGuard')) {
    continue;
  }

  const classHasPermission = classPermissionRegex.test(
    content.slice(0, content.indexOf('export class') > -1 ? content.indexOf('export class') : content.length),
  );

  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*@(?:Get|Post|Patch|Put|Delete)\b/.test(lines[i])) {
      continue;
    }

    const start = Math.max(0, i - 8);
    const decoratorsBlock = lines.slice(start, i + 1).join('\n');
    const methodHasPermission = permissionRegex.test(decoratorsBlock);

    if (!classHasPermission && !methodHasPermission) {
      hasProblem = true;
      console.log(`${file}:${i + 1} => ${lines[i].trim()} has no @Permissions/@AnyPermission`);
    }
  }
}

if (!hasProblem) {
  console.log('OK: all permission-guarded controller routes have permission metadata.');
}
