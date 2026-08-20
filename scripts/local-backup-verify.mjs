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
  console.log('LOCAL_BACKUP_DIR is empty; backup verification skipped.');
  process.exit(0);
}

const expanded = configured.startsWith('~/')
  ? path.join(process.env.HOME || '', configured.slice(2))
  : configured;
const backupRootCandidate = path.resolve(expanded);
if (!fs.existsSync(backupRootCandidate)) throw new Error('LOCAL_BACKUP_DIR does not exist.');
const backupRoot = fs.realpathSync(backupRootCandidate);
const latestPath = path.join(backupRoot, 'latest.json');
if (!fs.existsSync(latestPath)) throw new Error('No latest.json found in LOCAL_BACKUP_DIR.');
if (fs.lstatSync(latestPath).isSymbolicLink()) throw new Error('latest.json must not be a symlink.');

function safeInside(parent, child) {
  const rel = path.relative(parent, child);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
const snapshotCandidate = path.resolve(String(latest.snapshot || ''));
if (!safeInside(backupRoot, snapshotCandidate)) throw new Error('latest.json points outside LOCAL_BACKUP_DIR.');
const snapshot = fs.realpathSync(snapshotCandidate);
if (!safeInside(backupRoot, snapshot)) throw new Error('latest.json resolves outside LOCAL_BACKUP_DIR.');

const manifestPath = path.join(snapshot, 'manifest.json');
if (!fs.existsSync(manifestPath)) throw new Error(`Backup manifest missing: ${manifestPath}`);
if (fs.lstatSync(manifestPath).isSymbolicLink()) throw new Error('Backup manifest must not be a symlink.');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) throw new Error('Unsupported or invalid backup manifest.');
const failures = [];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

for (const item of manifest.files) {
  const candidate = path.resolve(snapshot, String(item.path || ''));
  if (!safeInside(snapshot, candidate)) {
    failures.push(`Unsafe manifest path: ${item.path}`);
    continue;
  }
  if (!fs.existsSync(candidate)) {
    failures.push(`Missing: ${item.path}`);
    continue;
  }
  const lstat = fs.lstatSync(candidate);
  if (lstat.isSymbolicLink() || !lstat.isFile()) {
    failures.push(`Unsafe backup entry: ${item.path}`);
    continue;
  }
  const file = fs.realpathSync(candidate);
  if (!safeInside(snapshot, file)) {
    failures.push(`Backup entry resolves outside snapshot: ${item.path}`);
    continue;
  }
  const actualBytes = fs.statSync(file).size;
  const actualSha = sha256(file);
  if (actualBytes !== Number(item.bytes)) failures.push(`Size mismatch: ${item.path}`);
  if (actualSha !== item.sha256) failures.push(`SHA-256 mismatch: ${item.path}`);
}

if (failures.length) {
  console.error(`Private backup verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`Private backup verified: ${snapshot} (${manifest.files.length} file(s)).`);
