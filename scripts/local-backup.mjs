import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(process.cwd());
const configured = String(process.env.LOCAL_DATA_BACKUP_DIR || '').trim();
if (!configured) {
  console.log('LOCAL_DATA_BACKUP_DIR is empty; local operational-data backup skipped.');
  process.exit(0);
}

const backupRoot = path.resolve(configured);
const relToRepo = path.relative(root, backupRoot);
if (!relToRepo.startsWith('..') && !path.isAbsolute(relToRepo)) {
  throw new Error('LOCAL_DATA_BACKUP_DIR must be outside the public repository.');
}

const retentionDays = Math.max(1, Math.min(3650, Number(process.env.LOCAL_DATA_BACKUP_RETENTION_DAYS || 30)));
const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const destination = path.join(backupRoot, 'ASP-HP-AI', stamp);
fs.mkdirSync(destination, { recursive: true, mode: 0o700 });

const sources = [
  'data/search-console',
  'data/analytics',
  'data/ai-usage',
  'reports'
];

function copyTree(source, target) {
  if (!fs.existsSync(source)) return 0;
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    let count = 0;
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      count += copyTree(path.join(source, entry.name), path.join(target, entry.name));
    }
    return count;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.copyFileSync(source, target);
  try { fs.chmodSync(target, 0o600); } catch {}
  return 1;
}

let copiedFiles = 0;
for (const relative of sources) {
  copiedFiles += copyTree(path.join(root, relative), path.join(destination, relative));
}

const affiliateDir = path.join(root, 'data', 'affiliate');
if (fs.existsSync(affiliateDir)) {
  for (const name of fs.readdirSync(affiliateDir)) {
    if (!name.endsWith('.json')) continue;
    copiedFiles += copyTree(
      path.join(affiliateDir, name),
      path.join(destination, 'data', 'affiliate', name)
    );
  }
}

function gitValue(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout || '').trim() : null;
}

const manifest = {
  createdAt: now.toISOString(),
  sourceRepository: 'ASP-HP-AI',
  sourceBranch: gitValue(['rev-parse', '--abbrev-ref', 'HEAD']),
  sourceCommit: gitValue(['rev-parse', 'HEAD']),
  copiedFiles,
  excludedByDesign: ['.env', '.env.local', 'imports/', 'logs/'],
  retentionDays
};
fs.writeFileSync(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

const snapshotsRoot = path.join(backupRoot, 'ASP-HP-AI');
const cutoff = Date.now() - retentionDays * 86400000;
let removed = 0;
for (const entry of fs.readdirSync(snapshotsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const full = path.join(snapshotsRoot, entry.name);
  const stat = fs.statSync(full);
  if (stat.mtimeMs < cutoff) {
    fs.rmSync(full, { recursive: true, force: true });
    removed += 1;
  }
}

console.log(`Local backup complete: ${copiedFiles} file(s) -> ${destination}; pruned ${removed} old snapshot(s).`);
