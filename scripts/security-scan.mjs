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
for (const relative of files) {
  const base = path.basename(relative);
  const envLike = /^\.env(?:$|\.|rc$)/i.test(base);
  const safeExample = /\.example$/i.test(base);
  if (envLike && !safeExample) failures.push(`${relative}: environment file must never be tracked; commit only *.example templates.`);
}

// The repository is public. Operational observations and revenue reports must
// stay on the operator's machine, even if someone force-adds an ignored file.
const privatePrefixes = [
  'data/search-console/',
  'data/analytics/',
  'data/ai-usage/',
  'reports/',
  'imports/'
];
for (const relative of files) {
  if (privatePrefixes.some((prefix) => relative.startsWith(prefix))) {
    failures.push(`${relative}: operational/private data must not be tracked in this public repository`);
  }
  if (/^data\/affiliate\/.*\.json$/i.test(relative)) {
    failures.push(`${relative}: affiliate revenue data must remain local-only`);
  }
}

const textExtensions = new Set(['.js','.mjs','.cjs','.ts','.tsx','.astro','.md','.json','.yml','.yaml','.toml','.txt','.env','.example']);
const directPatterns = [
  { name: 'private key block', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'GitHub personal token', regex: /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/ },
  { name: 'OpenAI-style secret key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{30,}\b/ }
];
const assignmentNames = [
  'GSC_PRIVATE_KEY',
  'GA_PRIVATE_KEY',
  'CLOUDFLARE_API_TOKEN',
  'VALUECOMMERCE_CLIENT_KEY',
  'VALUECOMMERCE_CLIENT_SECRET'
];
const placeholderValues = new Set(['', '...', '<...>', '<secret>', 'change_me', 'changeme', 'example', 'your-token', 'your-secret', 'null']);

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
    // Covers ENV syntax plus simple JSON/YAML assignments such as
    // "CLOUDFLARE_API_TOKEN": "..." without matching process.env reads.
    // Use horizontal whitespace only. `\s` also consumes newlines and could
    // incorrectly treat the following ENV assignment as this key's value.
    const regex = new RegExp(`^[ \\t]*["']?${name}["']?[ \\t]*(?:=|:)[ \\t]*([^\\r\\n]*)$`, 'gmi');
    for (const match of text.matchAll(regex)) {
      let value = String(match[1] || '').trim();
      value = value.replace(/[,}]\s*$/, '').trim();
      value = value.replace(/\\\s*$/, '').trim();
      value = value.replace(/^['\"]|['\"]$/g, '').trim();
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
