import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const warnings = [];

function trackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  if (result.status === 0) return String(result.stdout || '').split('\0').filter(Boolean);
  warnings.push('git ls-files unavailable; falling back to repository walk.');
  const ignored = new Set(['.git', 'node_modules', 'dist', '.astro', 'logs']);
  function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (ignored.has(entry.name)) return [];
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [path.relative(root, full)];
    });
  }
  return walk(root);
}

const files = trackedFiles();
for (const forbidden of ['.env', '.env.local']) {
  if (files.includes(forbidden)) failures.push(`${forbidden} must never be tracked.`);
}

const textExtensions = new Set(['.js','.mjs','.cjs','.ts','.tsx','.astro','.md','.json','.yml','.yaml','.toml','.txt','.env','.example']);
const directPatterns = [
  { name: 'private key block', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'GitHub personal token', regex: /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/ },
  { name: 'OpenAI-style secret key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ }
];
const assignmentNames = [
  'GSC_PRIVATE_KEY',
  'GA_PRIVATE_KEY',
  'CLOUDFLARE_API_TOKEN',
  'VALUECOMMERCE_CLIENT_KEY',
  'VALUECOMMERCE_CLIENT_SECRET'
];
const placeholderValues = new Set(['', '...', '<...>', '<secret>', 'change_me', 'changeme', 'example', 'your-token', 'your-secret']);

for (const relative of files) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
  const ext = path.extname(relative).toLowerCase();
  const base = path.basename(relative).toLowerCase();
  if (!textExtensions.has(ext) && !base.startsWith('.env')) continue;
  let text;
  try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
  if (text.includes('\u0000')) continue;

  for (const pattern of directPatterns) {
    if (pattern.regex.test(text)) failures.push(`${relative}: possible ${pattern.name} committed`);
  }

  for (const name of assignmentNames) {
    const regex = new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, 'gmi');
    for (const match of text.matchAll(regex)) {
      const value = String(match[1] || '').replace(/^['\"]|['\"]$/g, '').trim();
      if (!placeholderValues.has(value.toLowerCase()) && !value.startsWith('${') && !value.startsWith('$')) {
        failures.push(`${relative}: ${name} appears to contain a committed value`);
      }
    }
  }
}

for (const warning of warnings) console.warn(`WARN ${warning}`);
if (failures.length) {
  console.error('Security scan failed:\n- ' + [...new Set(failures)].join('\n- '));
  process.exit(1);
}
console.log(`Security scan passed (${files.length} tracked file(s) inspected).`);
