import './lib/load-local-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = fs.realpathSync(process.cwd());
const configured = String(process.env.LOCAL_BACKUP_DIR || '').trim();
const args = process.argv.slice(2);
const confirmed = args.includes('--confirm');
const latestRequested = args.includes('--latest');
const snapshotIndex = args.indexOf('--snapshot');
const snapshotArg = snapshotIndex >= 0 ? args[snapshotIndex + 1] : null;

if (!configured) throw new Error('LOCAL_BACKUP_DIR is required for restore.');
if (!confirmed) throw new Error('Restore is destructive for local operational data. Re-run with --confirm.');
if (!latestRequested && !snapshotArg) throw new Error('Choose --latest or --snapshot <snapshot-directory>.');
if (latestRequested && snapshotArg) throw new Error('Use only one of --latest or --snapshot.');

const expanded = configured.startsWith('~/')
  ? path.join(process.env.HOME || '', configured.slice(2))
  : configured;
const backupRootCandidate = path.resolve(expanded);
if (!fs.existsSync(backupRootCandidate)) throw new Error('LOCAL_BACKUP_DIR does not exist.');
const backupRoot = fs.realpathSync(backupRootCandidate);

function safeInside(parent, child) {
  const rel = path.relative(parent, child);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

let snapshotCandidate;
if (latestRequested) {
  const latestFile = path.join(backupRoot, 'latest.json');
  if (!fs.existsSync(latestFile)) throw new Error('LOCAL_BACKUP_DIR/latest.json does not exist.');
  if (fs.lstatSync(latestFile).isSymbolicLink()) throw new Error('latest.json must not be a symlink.');
  const latest = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
  snapshotCandidate = path.resolve(String(latest.snapshot || ''));
} else {
  snapshotCandidate = path.isAbsolute(snapshotArg) ? path.resolve(snapshotArg) : path.resolve(backupRoot, snapshotArg);
}

if (!safeInside(backupRoot, snapshotCandidate)) throw new Error('Requested snapshot must be inside LOCAL_BACKUP_DIR.');
const snapshot = fs.realpathSync(snapshotCandidate);
if (!safeInside(backupRoot, snapshot)) throw new Error('Snapshot resolves outside LOCAL_BACKUP_DIR.');

const manifestFile = path.join(snapshot, 'manifest.json');
if (!fs.existsSync(manifestFile)) throw new Error('Snapshot manifest.json is missing.');
if (fs.lstatSync(manifestFile).isSymbolicLink()) throw new Error('Snapshot manifest must not be a symlink.');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) throw new Error('Unsupported or invalid backup manifest.');

const allowedRoots = [
  'data/search-console',
  'data/analytics',
  'data/affiliate',
  'data/ai-usage',
  'reports'
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const verifiedEntries = [];

// Verify the entire snapshot before deleting any current local data.
for (const item of manifest.files) {
  const relative = String(item.path || '').replace(/\\/g, '/');
  const allowed = allowedRoots.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`));
  if (!allowed) throw new Error(`Manifest contains non-restorable path: ${relative}`);
  const sourceCandidate = path.resolve(snapshot, relative);
  if (!safeInside(snapshot, sourceCandidate)) throw new Error(`Unsafe manifest path: ${relative}`);
  if (!fs.existsSync(sourceCandidate)) throw new Error(`Backup file missing: ${relative}`);
  const lstat = fs.lstatSync(sourceCandidate);
  if (!lstat.isFile() || lstat.isSymbolicLink()) throw new Error(`Unsafe backup entry: ${relative}`);
  const source = fs.realpathSync(sourceCandidate);
  if (!safeInside(snapshot, source)) throw new Error(`Backup entry resolves outside snapshot: ${relative}`);
  const stat = fs.statSync(source);
  if (stat.size !== Number(item.bytes)) throw new Error(`Backup size mismatch: ${relative}`);
  if (sha256(source) !== item.sha256) throw new Error(`Backup SHA-256 mismatch: ${relative}`);
  verifiedEntries.push({ relative, source });
}

for (const relative of allowedRoots) {
  fs.rmSync(path.join(root, relative), { recursive: true, force: true });
}

for (const { relative, source } of verifiedEntries) {
  const destination = path.resolve(root, relative);
  if (!safeInside(root, destination)) throw new Error(`Unsafe restore destination: ${relative}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  fs.copyFileSync(source, destination);
  try { fs.chmodSync(destination, 0o600); } catch {}
}

for (const relative of allowedRoots) {
  const target = path.join(root, relative);
  if (fs.existsSync(target)) {
    try { fs.chmodSync(target, 0o700); } catch {}
  }
}

fs.mkdirSync(path.join(root, 'reports'), { recursive: true, mode: 0o700 });
fs.writeFileSync(
  path.join(root, 'reports', 'restore-report.json'),
  `${JSON.stringify({ restoredAt: new Date().toISOString(), snapshot, restoredFiles: verifiedEntries.length }, null, 2)}\n`,
  { mode: 0o600 }
);

console.log(`Restored ${verifiedEntries.length} private operational file(s) from ${snapshot}.`);
