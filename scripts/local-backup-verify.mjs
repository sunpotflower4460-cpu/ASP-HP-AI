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
const backupRoot = path.resolve(expanded);
const latestPath = path.join(backupRoot, 'latest.json');
if (!fs.existsSync(latestPath)) throw new Error('No latest.json found in LOCAL_BACKUP_DIR.');

const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
const snapshot = path.resolve(String(latest.snapshot || ''));
const relative = path.relative(backupRoot, snapshot);
if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('latest.json points outside LOCAL_BACKUP_DIR.');

const manifestPath = path.join(snapshot, 'manifest.json');
if (!fs.existsSync(manifestPath)) throw new Error(`Backup manifest missing: ${manifestPath}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

for (const item of manifest.files || []) {
  const file = path.resolve(snapshot, item.path);
  const rel = path.relative(snapshot, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    failures.push(`Unsafe manifest path: ${item.path}`);
    continue;
  }
  if (!fs.existsSync(file)) {
    failures.push(`Missing: ${item.path}`);
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

console.log(`Private backup verified: ${snapshot} (${(manifest.files || []).length} file(s)).`);
