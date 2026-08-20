import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const rules = JSON.parse(fs.readFileSync(path.join(root, 'data/rules.json'), 'utf8'));
const offerDir = path.join(root, 'data/offers');
const failures = [];
const warnings = [];
const validUrl = (value) => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };

const seenOfferIds = new Set();
for (const file of fs.readdirSync(offerDir).filter((f) => f.endsWith('.json'))) {
  const offer = JSON.parse(fs.readFileSync(path.join(offerDir, file), 'utf8'));
  if (!offer.id || !offer.name || !offer.asp || !offer.status) failures.push(`${file}: required offer fields missing`);
  if (seenOfferIds.has(offer.id)) failures.push(`${file}: duplicate offer id '${offer.id}'`);
  seenOfferIds.add(offer.id);
  if (offer.status === 'active') {
    if (!offer.affiliateUrl) failures.push(`${file}: active offer requires affiliateUrl`);
    if (!offer.officialUrl) failures.push(`${file}: active offer requires officialUrl`);
    if (offer.affiliateUrl && !validUrl(offer.affiliateUrl)) failures.push(`${file}: affiliateUrl must use HTTPS`);
    if (offer.officialUrl && !validUrl(offer.officialUrl)) failures.push(`${file}: officialUrl must use HTTPS`);
    if (!(offer.allowedMedia || []).includes('web')) failures.push(`${file}: active offer must explicitly allow web`);
  }
  for (const [key, fact] of Object.entries(offer.facts || {})) {
    if (!fact.source || !fact.checkedAt || !fact.ttlDays) failures.push(`${file}: fact ${key} lacks source/checkedAt/ttlDays`);
    if (fact.source && !validUrl(fact.source)) failures.push(`${file}: fact ${key} source must use HTTPS`);
  }
  if (!['a8','valuecommerce'].includes(String(offer.asp).toLowerCase())) warnings.push(`${file}: ASP '${offer.asp}' has no built-in adapter yet`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
for (const file of walk(path.join(root, 'src/pages')).filter((f) => /\.(astro|md|mdx)$/.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const phrase of rules.prohibitedPhrases) if (text.includes(phrase)) failures.push(`${path.relative(root,file)}: prohibited phrase '${phrase}'`);
}

for (const warning of warnings) console.warn(`WARN ${warning}`);
if (failures.length) {
  console.error('Validation failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Content validation passed.');
