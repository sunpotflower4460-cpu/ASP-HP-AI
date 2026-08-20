import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isSafeHttpsUrl } from './lib/url-safety.mjs';

const root = fs.realpathSync(process.cwd());
const checks = [];
const envPath = path.join(root, '.env.local');

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

function check(id, ok, level, message) {
  checks.push({ id, ok: Boolean(ok), level, message });
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  return { ok: result.status === 0, stdout: String(result.stdout || '').trim(), stderr: String(result.stderr || '').trim() };
}

loadEnvFile(envPath);
check('env-local', fs.existsSync(envPath), 'required', '.env.local exists');

const gitRepo = capture('git', ['rev-parse', '--is-inside-work-tree']);
check('git-repository', gitRepo.ok && gitRepo.stdout === 'true', 'required', 'current directory is a Git repository');

const branchResult = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
const targetBranch = process.env.LOCAL_AUTOMATION_BRANCH || 'main';
check('target-branch', branchResult.ok && branchResult.stdout === targetBranch, 'required', `current branch is ${targetBranch}`);

const statusResult = capture('git', ['status', '--porcelain']);
check('clean-working-tree', statusResult.ok && statusResult.stdout === '', 'required', 'working tree is clean');

const automationEnabled = process.env.LOCAL_AUTOMATION_ENABLED === 'true';
const autoPush = process.env.LOCAL_AUTO_PUSH === 'true';
check('automation-enabled', automationEnabled, 'warning', 'LOCAL_AUTOMATION_ENABLED=true');
check('auto-push-safety', !autoPush || automationEnabled, 'required', 'LOCAL_AUTO_PUSH=true requires LOCAL_AUTOMATION_ENABLED=true');

const siteUrl = String(process.env.SITE_URL || '').trim();
const publicReady = process.env.PUBLIC_READY === 'true';
check('public-site-url', !publicReady || isSafeHttpsUrl(siteUrl), 'required', 'PUBLIC_READY=true requires a real HTTPS SITE_URL without credentials/placeholders/local hosts');

const gscValues = [process.env.GSC_CLIENT_EMAIL, process.env.GSC_PRIVATE_KEY, process.env.GSC_SITE_URL].map((value) => String(value || '').trim());
const gscAny = gscValues.some(Boolean);
const gscComplete = gscValues.every(Boolean);
check('gsc-configuration', !gscAny || gscComplete, 'required', 'Search Console credentials are either complete or entirely unset');

const gaMeasurementId = String(process.env.PUBLIC_GA_MEASUREMENT_ID || '').trim();
check('ga-measurement-id', !gaMeasurementId || /^G-[A-Z0-9]+$/i.test(gaMeasurementId), 'required', 'PUBLIC_GA_MEASUREMENT_ID is empty or matches G-XXXXXXXXXX');
const gaRequired = process.env.GA_FETCH_REQUIRED === 'true';
const gaProperty = String(process.env.GA_PROPERTY_ID || '').trim();
const gaEmail = String(process.env.GA_CLIENT_EMAIL || process.env.GSC_CLIENT_EMAIL || '').trim();
const gaKey = String(process.env.GA_PRIVATE_KEY || process.env.GSC_PRIVATE_KEY || '').trim();
check('ga-property-id', !gaProperty || /^\d+$/.test(gaProperty), 'required', 'GA_PROPERTY_ID is empty or numeric');
check('ga-required-config', !gaRequired || (gaProperty && gaEmail && gaKey), 'required', 'GA_FETCH_REQUIRED=true requires GA_PROPERTY_ID and readable credentials');

const vcKey = String(process.env.VALUECOMMERCE_CLIENT_KEY || '').trim();
const vcSecret = String(process.env.VALUECOMMERCE_CLIENT_SECRET || '').trim();
check('valuecommerce-pair', Boolean(vcKey) === Boolean(vcSecret), 'required', 'ValueCommerce client key/secret are both set or both unset');

const aiEnabled = process.env.AI_EDITOR_ENABLED === 'true';
const cfAccount = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const cfToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
check('ai-editor-config', !aiEnabled || (cfAccount && cfToken), 'required', 'AI_EDITOR_ENABLED=true requires Cloudflare account/token');
check('auto-apply-config', process.env.EDITOR_AUTO_APPLY_TITLE !== 'true' || aiEnabled, 'required', 'EDITOR_AUTO_APPLY_TITLE=true requires AI_EDITOR_ENABLED=true');

const backupRequired = process.env.LOCAL_BACKUP_REQUIRED === 'true';
const backupConfigured = String(process.env.LOCAL_BACKUP_DIR || '').trim();
check('backup-required-config', !backupRequired || Boolean(backupConfigured), 'required', 'LOCAL_BACKUP_REQUIRED=true requires LOCAL_BACKUP_DIR');
check('auto-push-backup', !autoPush || Boolean(backupConfigured), 'warning', 'LOCAL_AUTO_PUSH=true is safer with LOCAL_BACKUP_DIR configured');
if (backupConfigured) {
  const expanded = backupConfigured.startsWith('~/') ? path.join(process.env.HOME || '', backupConfigured.slice(2)) : backupConfigured;
  const backupRoot = path.resolve(expanded);
  const relative = path.relative(root, backupRoot);
  const outsideRepo = backupRoot !== root && (relative.startsWith('..') || path.isAbsolute(relative));
  check('backup-outside-repo', outsideRepo, 'required', 'LOCAL_BACKUP_DIR is outside the public repository');
  if (outsideRepo) {
    let writable = false;
    try {
      fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
      const probe = path.join(backupRoot, `.asp-hp-ai-doctor-${process.pid}`);
      fs.writeFileSync(probe, 'ok', { mode: 0o600 });
      fs.rmSync(probe, { force: true });
      writable = true;
    } catch {}
    check('backup-writable', writable, 'required', 'LOCAL_BACKUP_DIR is writable');
  }
}

const a8Path = String(process.env.A8_AUTO_IMPORT_FILE || '').trim();
if (a8Path) {
  const resolved = path.isAbsolute(a8Path) ? a8Path : path.join(root, a8Path);
  check('a8-import-file', fs.existsSync(resolved), 'warning', 'A8_AUTO_IMPORT_FILE currently exists');
}

const majorNode = Number(process.versions.node.split('.')[0] || 0);
check('node-version', majorNode >= 22, 'required', `Node.js 22+ required (current ${process.versions.node})`);
check('platform', process.platform === 'darwin', 'warning', `launchd requires macOS (current ${process.platform})`);

const failures = checks.filter((item) => item.level === 'required' && !item.ok);
const warnings = checks.filter((item) => item.level === 'warning' && !item.ok);
for (const item of checks) {
  const prefix = item.ok ? 'PASS' : item.level === 'required' ? 'FAIL' : 'WARN';
  console.log(`${prefix} ${item.id}: ${item.message}`);
}

fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports', 'local-doctor.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), ok: failures.length === 0, failures, warnings, checks }, null, 2)}\n`);

if (failures.length) {
  console.error(`Local doctor failed with ${failures.length} required issue(s).`);
  process.exit(1);
}
console.log(`Local doctor passed with ${warnings.length} warning(s).`);
