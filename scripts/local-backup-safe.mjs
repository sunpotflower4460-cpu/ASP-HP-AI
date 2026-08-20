import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = fs.realpathSync(process.cwd());

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, '.env.local'));

const configured = String(process.env.LOCAL_BACKUP_DIR || '').trim();
if (!configured) {
  console.log('LOCAL_BACKUP_DIR is empty; private-data backup skipped.');
  process.exit(0);
}

const expanded = configured.startsWith('~/')
  ? path.join(process.env.HOME || '', configured.slice(2))
  : configured;
const backupRootCandidate = path.resolve(expanded);
fs.mkdirSync(backupRootCandidate, { recursive: true, mode: 0o700 });
const backupRoot = fs.realpathSync(backupRootCandidate);
const relativeToRepo = path.relative(root, backupRoot);
if (backupRoot === root || (!relativeToRepo.startsWith('..') && !path.isAbsolute(relativeToRepo))) {
  throw new Error('LOCAL_BACKUP_DIR must resolve outside the Git repository.');
}

const retentionDays = Number(process.env.LOCAL_BACKUP_RETENTION_DAYS || 30);
if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
  throw new Error('LOCAL_BACKUP_RETENTION_DAYS must be an integer from 1 to 3650.');
}

const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const snapshotDir = path.join(backupRoot, stamp);
const sources = [
  'data/search-console',
  'data/analytics',
  'data/affiliate',
  'data/ai-usage',
  'reports'
];

function shouldCopyFile(source) {
  const relative = path.relative(root, source).replace(/\\/g, '/');
  // data/affiliate contains a tracked README. Only runtime JSON observations
  // from that directory belong in the private backup.
  if (relative.startsWith('data/affiliate/')) return relative.endsWith('.json');
  return true;
}

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) return;
  const sourceStat = fs.lstatSync(source);
  if (sourceStat.isSymbolicLink() || !sourceStat.isDirectory()) return;
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) {
      console.warn(`Skipping symlink in private backup: ${path.relative(root, src)}`);
      continue;
    }
    if (entry.isDirectory()) copyDirectory(src, dst);
    else if (entry.isFile() && shouldCopyFile(src)) {
      fs.copyFileSync(src, dst);
      try { fs.chmodSync(dst, 0o600); } catch {}
    }
  }
}

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? collectFiles(full) : entry.isFile() ? [full] : [];
  });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

fs.mkdirSync(snapshotDir, { recursive: true, mode: 0o700 });
for (const relative of sources) {
  copyDirectory(path.join(root, relative), path.join(snapshotDir, relative));
}

const files = collectFiles(snapshotDir);
const manifest = {
  schemaVersion: 1,
  createdAt: now.toISOString(),
  sourceRepository: path.basename(root),
  retentionDays,
  files: files.map((file) => ({
    path: path.relative(snapshotDir, file),
    bytes: fs.statSync(file).size,
    sha256: sha256(file)
  }))
};
fs.writeFileSync(path.join(snapshotDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
for (const entry of fs.readdirSync(backupRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/.test(entry.name)) continue;
  const full = path.join(backupRoot, entry.name);
  if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { recursive: true, force: true });
}

const latestPayload = `${JSON.stringify({ snapshot: snapshotDir, createdAt: now.toISOString(), files: manifest.files.length }, null, 2)}\n`;
const latestTemp = path.join(backupRoot, `.latest.${process.pid}.${Date.now()}.tmp`);
fs.writeFileSync(latestTemp, latestPayload, { mode: 0o600 });
fs.renameSync(latestTemp, path.join(backupRoot, 'latest.json'));
console.log(`Private operational snapshot created: ${snapshotDir} (${manifest.files.length} file(s)).`);
