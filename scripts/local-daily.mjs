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

function capture(command, args) {
  const result = run(command, args, { capture: true });
  return String(result.stdout || '').trim();
}

const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== targetBranch) throw new Error(`Local automation only runs on '${targetBranch}', current branch is '${branch}'.`);

const dirty = capture('git', ['status', '--porcelain']);
if (dirty) throw new Error('Working tree is not clean. Local automation will not overwrite human changes.');

run('git', ['pull', '--ff-only', 'origin', targetBranch]);

const a8Import = process.env.A8_AUTO_IMPORT_FILE?.trim();
if (a8Import) {
  const resolved = path.isAbsolute(a8Import) ? a8Import : path.join(root, a8Import);
  if (fs.existsSync(resolved)) {
    run(npmCommand, ['run', 'a8:import', '--', resolved]);
  } else {
    console.warn(`A8_AUTO_IMPORT_FILE does not exist; continuing without A8 refresh: ${resolved}`);
  }
}

run(npmCommand, ['run', 'daily']);
process.env.VERIFY_PRODUCTION = process.env.PUBLIC_READY === 'true' ? 'true' : 'false';
run(npmCommand, ['run', 'verify']);

const allowlistedPaths = [
  'data/search-console/latest.json',
  'data/affiliate/a8-latest.json',
  'data/affiliate/valuecommerce-latest.json',
  'data/affiliate/normalized-latest.json',
  'data/ai-usage',
  'reports/readiness.json',
  'reports/verification.json',
  'reports/latest.json',
  'reports/editor-plan.json',
  'reports/ai-editor-proposal.json',
  'src/pages'
];

for (const target of allowlistedPaths) {
  if (fs.existsSync(path.join(root, target))) run('git', ['add', '--', target]);
}

const staged = capture('git', ['diff', '--cached', '--name-only']);
if (!staged) {
  console.log('No allowlisted autonomous changes to commit.');
  process.exit(0);
}

const allowed = staged.split(/\r?\n/).filter(Boolean).every((file) =>
  allowlistedPaths.some((prefix) => file === prefix || file.startsWith(`${prefix}/`))
);
if (!allowed) throw new Error(`Refusing commit because staged files escaped allowlist:\n${staged}`);

const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
run('git', ['commit', '-m', `chore: autonomous site update ${date}`]);

if (autoPush) {
  run('git', ['push', 'origin', targetBranch]);
  console.log('Autonomous update pushed. Cloudflare Pages Git integration will run the deployment gate.');
} else {
  console.log('Autonomous update committed locally. Set LOCAL_AUTO_PUSH=true only after the local loop is verified.');
}
