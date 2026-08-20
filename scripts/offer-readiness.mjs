import fs from 'node:fs';
import { evaluateOffer, loadOffer } from './lib/offer-tools.mjs';

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run offer:check -- <offer-id>');
  process.exit(1);
}
const { offer } = loadOffer(id);
const result = evaluateOffer(offer);
for (const check of result.checks) {
  console.log(`${check.ok ? 'PASS' : check.level === 'required' ? 'FAIL' : 'NOTE'} [${check.level}] ${check.id}: ${check.message}`);
}
const output = { checkedAt: new Date().toISOString(), offerId: id, readyForActivation: result.ready, checks: result.checks };
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(`reports/offer-readiness-${id}.json`, `${JSON.stringify(output, null, 2)}\n`);
if (!result.ready) {
  console.error(`${result.requiredFailures.length} required offer check(s) failed.`);
  process.exit(1);
}
console.log(`Offer '${id}' is ready for explicit activation after human ASP-rule confirmation.`);
