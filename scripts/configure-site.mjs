import fs from 'node:fs';
import { isSafeSiteBaseUrl } from './lib/url-safety.mjs';

const file = 'data/site.json';
const current = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);

function valueOf(name) {
  const direct = args.find((arg) => arg.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3).trim();
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < args.length) return String(args[index + 1]).trim();
  return undefined;
}

const updates = {
  name: valueOf('name'),
  url: valueOf('url'),
  description: valueOf('description'),
  operator: valueOf('operator'),
  contact: valueOf('contact')
};

if (Object.values(updates).every((value) => value === undefined)) {
  console.error('No changes supplied. Example: npm run site:configure -- --url https://example.jp --operator "運営者名" --contact "contact@example.jp"');
  process.exit(1);
}

const next = { ...current };
for (const [key, value] of Object.entries(updates)) {
  if (value !== undefined) next[key] = value;
}

const errors = [];
if (!String(next.name || '').trim()) errors.push('name is required.');
if (!String(next.description || '').trim()) errors.push('description is required.');
if (!String(next.operator || '').trim()) errors.push('operator is required.');
if (!String(next.contact || '').trim()) errors.push('contact is required.');

try {
  const url = new URL(String(next.url || ''));
  if (!isSafeSiteBaseUrl(url.toString())) errors.push('url must be a real HTTPS origin URL with no subpath/query/hash/credentials/placeholders/local hosts.');
  next.url = url.origin;
} catch {
  errors.push('url must be a valid absolute HTTPS origin URL.');
}

for (const key of ['name', 'operator', 'contact']) {
  if (String(next[key] || '').length > 160) errors.push(`${key} is unexpectedly long.`);
}
if (String(next.description || '').length > 300) errors.push('description is unexpectedly long.');

if (errors.length) {
  console.error(`Site configuration rejected:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
console.log('Updated data/site.json. PUBLIC_READY was not changed.');
console.log(`Site: ${next.name}`);
console.log(`URL: ${next.url}`);
console.log('Run `npm run readiness` and `npm run verify` before publishing.');
