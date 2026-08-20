import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const rules = JSON.parse(fs.readFileSync(path.join(root, 'data/rules.json'), 'utf8'));
const offerDir = path.join(root, 'data/offers');
const failures = [];

for (const file of fs.readdirSync(offerDir).filter((f) => f.endsWith('.json'))) {
  const offer = JSON.parse(fs.readFileSync(path.join(offerDir, file), 'utf8'));
  if (!offer.id || !offer.name || !offer.asp || !offer.status) failures.push(`${file}: required offer fields missing`);
  if (offer.status === 'active' && !offer.affiliateUrl) failures.push(`${file}: active offer requires affiliateUrl`);
  for (const [key, fact] of Object.entries(offer.facts || {})) {
    if (!fact.source || !fact.checkedAt || !fact.ttlDays) failures.push(`${file}: fact ${key} lacks source/checkedAt/ttlDays`);
  }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
for (const file of walk(path.join(root, 'src/pages')).filter((f) => /\.(astro|md|mdx)$/.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const phrase of rules.prohibitedPhrases) if (text.includes(phrase)) failures.push(`${path.relative(root,file)}: prohibited phrase '${phrase}'`);
}

if (failures.length) {
  console.error('Validation failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Content validation passed.');
