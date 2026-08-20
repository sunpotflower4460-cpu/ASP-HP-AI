import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const basePath = [path.dirname(process.execPath), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].join(path.delimiter);

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
process.env.PATH = `${basePath}${path.delimiter}${process.env.PATH || ''}`;

if (process.env.LOCAL_AUTOMATION_ENABLED !== 'true') {
  console.log('LOCAL_AUTOMATION_ENABLED is not true; local daily automation skipped.');
  process.exit(0);
}

const targetBranch = process.env.LOCAL_AUTOMATION_BRANCH || 'main';
const autoPush = process.env.LOCAL_AUTO_PUSH === 'true';
fs.mkdirSync(path.join(root, 'logs'), { recursive: true });

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: process.env
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
  return result;
}

function capture(command, args, { allowFailure = false } = {}) {
  const result = run(command, args, { capture: true, allowFailure });
  return { status: result.status ?? 1, stdout: String(result.stdout || '').trim(), stderr: String(result.stderr || '').trim() };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function strippedPauseFields(value) {
  const clone = JSON.parse(JSON.stringify(value));
  delete clone.status;
  delete clone.pausedAt;
  delete clone.pauseReason;
  return clone;
}

function isSafeAutomatedOfferPause(file) {
  if (!/^data\/offers\/[^/]+\.json$/.test(file)) return false;
  const previous = capture('git', ['show', `HEAD:${file}`], { allowFailure: true });
  if (previous.status !== 0) return false;
  const currentPath = path.join(root, file);
  if (!fs.existsSync(currentPath)) return false;
  try {
    const before = JSON.parse(previous.stdout);
    const after = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
    if (before.status !== 'active' || after.status !== 'paused') return false;
    if (!String(after.pauseReason || '').startsWith('auto safety pause:')) return false;
    if (!Number.isFinite(Date.parse(after.pausedAt || ''))) return false;
    return stable(strippedPauseFields(before)) === stable(strippedPauseFields(after));
  } catch {
    return false;
  }
}

const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout;
if (branch !== targetBranch) throw new Error(`Local automation only runs on '${targetBranch}', current branch is '${branch}'.`);

const dirty = capture('git', ['status', '--porcelain']).stdout;
if (dirty) throw new Error('Working tree is not clean. Local automation will not overwrite human changes.');

run('git', ['pull', '--ff-only', 'origin', targetBranch]);
run(npmCommand, ['run', 'local:doctor']);

// Safety scan may only move an existing active offer to paused. It never edits
// facts, URLs, tags or activates anything.
run(npmCommand, ['run', 'offer:safety-scan']);

const a8Import = process.env.A8_AUTO_IMPORT_FILE?.trim();
if (a8Import) {
  const resolved = path.isAbsolute(a8Import) ? a8Import : path.join(root, a8Import);
  if (fs.existsSync(resolved)) run(npmCommand, ['run', 'a8:import', '--', resolved]);
  else console.warn(`A8_AUTO_IMPORT_FILE does not exist; continuing without A8 refresh: ${resolved}`);
}

run(npmCommand, ['run', 'daily']);
process.env.VERIFY_PRODUCTION = process.env.PUBLIC_READY === 'true' ? 'true' : 'false';
run(npmCommand, ['run', 'verify']);
run(npmCommand, ['run', 'ops:summary']);

// Operational observations are intentionally local-only because this repository is public.
// If configured, snapshot them outside the repository before any public source is committed.
const backupRequired = process.env.LOCAL_BACKUP_REQUIRED === 'true';
const backupDir = process.env.LOCAL_BACKUP_DIR?.trim();
if (backupRequired && !backupDir) {
  throw new Error('LOCAL_BACKUP_REQUIRED=true but LOCAL_BACKUP_DIR is empty. Autonomous public-content commit is blocked.');
}
if (backupDir) {
  const backup = run(npmCommand, ['run', 'local:backup'], { allowFailure: true });
  if (backup.status !== 0) {
    const message = 'Private operational-data backup failed.';
    if (backupRequired) throw new Error(`${message} LOCAL_BACKUP_REQUIRED=true, so autonomous public-content commit is blocked.`);
    console.warn(`${message} Public-content automation may continue because LOCAL_BACKUP_REQUIRED is not true.`);
  } else {
    const backupVerify = run(npmCommand, ['run', 'local:backup:verify'], { allowFailure: true });
    if (backupVerify.status !== 0) {
      const message = 'Private backup integrity verification failed.';
      if (backupRequired) throw new Error(`${message} Autonomous public-content commit is blocked.`);
      console.warn(`${message} Public-content automation may continue because LOCAL_BACKUP_REQUIRED is not true.`);
    }
  }
}

// This repository is public. Search queries, analytics, ASP revenue, AI usage and
// operations reports remain local-only. Autonomous commits may contain only:
// 1) public page edits, and 2) semantically verified active -> paused safety changes.
const publicPagePrefix = 'src/pages';
const trackedChanged = capture('git', ['diff', '--name-only']).stdout.split(/\r?\n/).filter(Boolean);
const safeOfferFiles = [];
const unexpectedTracked = [];
for (const file of trackedChanged) {
  if (file === publicPagePrefix || file.startsWith(`${publicPagePrefix}/`)) continue;
  if (isSafeAutomatedOfferPause(file)) {
    safeOfferFiles.push(file);
    continue;
  }
  unexpectedTracked.push(file);
}
if (unexpectedTracked.length) {
  throw new Error(`Refusing autonomous commit because tracked files changed outside the allowed page/safety-pause rules:\n${unexpectedTracked.join('\n')}`);
}

if (fs.existsSync(path.join(root, publicPagePrefix))) run('git', ['add', '--', publicPagePrefix]);
for (const file of safeOfferFiles) run('git', ['add', '--', file]);

const staged = capture('git', ['diff', '--cached', '--name-only']).stdout;
if (!staged) {
  console.log('No public page or safe offer-pause changes to commit. Operational observations remain local-only.');
  process.exit(0);
}

const stagedFiles = staged.split(/\r?\n/).filter(Boolean);
for (const file of stagedFiles) {
  const isPage = file === publicPagePrefix || file.startsWith(`${publicPagePrefix}/`);
  const isSafePause = safeOfferFiles.includes(file) && isSafeAutomatedOfferPause(file);
  if (!isPage && !isSafePause) {
    throw new Error(`Refusing commit because staged file escaped autonomous rules: ${file}`);
  }
}

const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
run('git', ['commit', '-m', `chore: autonomous safety/content update ${date}`]);

if (autoPush) {
  run('git', ['push', 'origin', targetBranch]);
  console.log('Autonomous safe update pushed. Cloudflare Pages Git integration will run the deployment gate.');
} else {
  console.log('Autonomous safe update committed locally. Set LOCAL_AUTO_PUSH=true only after the local loop is verified.');
}
