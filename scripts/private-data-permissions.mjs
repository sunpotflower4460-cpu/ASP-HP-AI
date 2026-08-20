import fs from 'node:fs';
import path from 'node:path';

const root = fs.realpathSync(process.cwd());
const targets = [
  '.env.local',
  'data/search-console',
  'data/analytics',
  'data/affiliate',
  'data/ai-usage',
  'reports',
  'imports',
  'logs'
];

let files = 0;
let dirs = 0;
let skippedSymlinks = 0;

function secure(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    skippedSymlinks++;
    console.warn(`Skipping symlink while tightening private permissions: ${path.relative(root, target)}`);
    return;
  }
  if (stat.isDirectory()) {
    try { fs.chmodSync(target, 0o700); } catch {}
    dirs++;
    for (const entry of fs.readdirSync(target)) secure(path.join(target, entry));
    return;
  }
  if (stat.isFile()) {
    try { fs.chmodSync(target, 0o600); } catch {}
    files++;
  }
}

for (const relative of targets) secure(path.join(root, relative));
console.log(`Private permissions tightened: ${files} file(s), ${dirs} dir(s), ${skippedSymlinks} symlink(s) skipped.`);
