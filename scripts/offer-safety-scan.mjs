import './lib/load-local-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateOffer } from './lib/offer-tools.mjs';

const offerDir = path.join(process.cwd(), 'data', 'offers');
const files = fs.readdirSync(offerDir).filter((name) => name.endsWith('.json')).sort();
const paused = [];

for (const name of files) {
  const file = path.join(offerDir, name);
  const offer = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (offer.status !== 'active') continue;

  const result = evaluateOffer(offer);
  if (result.ready) continue;

  const failureIds = result.requiredFailures.map((item) => item.id).sort();
  const next = {
    ...offer,
    status: 'paused',
    pausedAt: new Date().toISOString(),
    pauseReason: `auto safety pause: ${failureIds.join(', ')}`
  };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  paused.push({ id: offer.id, file: path.relative(process.cwd(), file), failureIds });
  console.warn(`AUTO-PAUSED ${offer.id}: ${failureIds.join(', ')}`);
}

if (paused.length) {
  console.warn(`${paused.length} unsafe active offer(s) were paused. Auto-pause only removes exposure; it never activates or rewrites offer facts.`);
} else {
  console.log('Offer safety scan passed: no active offer required auto-pause.');
}
