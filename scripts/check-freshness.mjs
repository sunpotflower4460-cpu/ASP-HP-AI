import fs from 'node:fs';
import path from 'node:path';

const offerDir = path.join(process.cwd(), 'data/offers');
const now = Date.now();
const failures = [];
const warnings = [];

for (const file of fs.readdirSync(offerDir).filter((f) => f.endsWith('.json'))) {
  const offer = JSON.parse(fs.readFileSync(path.join(offerDir, file), 'utf8'));
  for (const [key, fact] of Object.entries(offer.facts || {})) {
    const checked = Date.parse(`${fact.checkedAt}T00:00:00Z`);
    const expires = checked + Number(fact.ttlDays || 0) * 86400000;
    if (!Number.isFinite(checked) || !fact.ttlDays) continue;
    if (now > expires) {
      const message = `${file}: ${key} expired on ${new Date(expires).toISOString().slice(0,10)}`;
      if (offer.status === 'active') failures.push(message);
      else warnings.push(message);
    }
  }
}

for (const warning of warnings) console.warn(`WARN ${warning}`);
if (failures.length) {
  console.error('Active offer freshness check failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Freshness check passed.');
