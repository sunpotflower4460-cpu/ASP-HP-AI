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
const backupRoot = fs.realpathSync(path.resolve(expanded));

function safeInside(parent, child) {
  const rel = path.relative(parent, child);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

let snapshot;
if (latestRequested) {
  const latestFile = path.join(backupRoot, 'latest.json');
  if (!fs.existsSync(latestFile)) throw new Error('LOCAL_BACKUP_DIR/latest.json does not exist.');
  const latest = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
  snapshot = path.resolve(String(latest.snapshot || ''));
} else {
  snapshot = path.isAbsolute(snapshotArg) ? path.resolve(snapshotArg) : path.resolve(backupRoot, snapshotArg);
}

if (!safeInside(backupRoot, snapshot)) throw new Error('Requested snapshot must be inside LOCAL_BACKUP_DIR.');
snapshot = fs.realpathSync(snapshot);
if (!safeInside(backupRoot, snapshot)) throw new Error('Snapshot resolves outside LOCAL_BACKUP_DIR.');

const manifestFile = path.join(snapshot, 'manifest.json');
if (!fs.existsSync(manifestFile)) throw new Error('Snapshot manifest.json is missing.');
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

// Verify the entire snapshot before deleting any current local data.
for (const item of manifest.files) {
  const relative = String(item.path || '').replace(/\\/g, '/');
  const allowed = allowedRoots.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`));
  if (!allowed) throw new Error(`Manifest contains non-restorable path: ${relative}`);
  const source = path.resolve(snapshot, relative);
  if (!safeInside(snapshot, source)) throw new Error(`Unsafe manifest path: ${relative}`);
  const stat = fs.lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe backup entry: ${relative}`);
  if (stat.size !== Number(item.bytes)) throw new Error(`Backup size mismatch: ${relative}`);
  if (sha256(source) !== item.sha256) throw new Error(`Backup SHA-256 mismatch: ${relative}`);
}

for (const relative of allowedRoots) {
  fs.rmSync(path.join(root, relative), { recursive: true, force: true });
}

for (const item of manifest.files) {
  const relative = String(item.path || '').replace(/\\/g, '/');
  const source = path.resolve(snapshot, relative);
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
  `${JSON.stringify({ restoredAt: new Date().toISOString(), snapshot, restoredFiles: manifest.files.length }, null, 2)}\n`,
  { mode: 0o600 }
);

console.log(`Restored ${manifest.files.length} private operational file(s) from ${snapshot}.`);
