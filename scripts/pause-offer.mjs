import './lib/load-local-env.mjs';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadOffer } from './lib/offer-tools.mjs';

const id = process.argv[2];
const reasonIndex = process.argv.indexOf('--reason');
const reason = reasonIndex >= 0 ? String(process.argv[reasonIndex + 1] || '').trim() : '';

if (!id) {
  console.error('Usage: npm run offer:pause -- <offer-id> [--reason "campaign ended"]');
  process.exit(1);
}

const { file, offer } = loadOffer(id);
if (offer.status === 'paused') {
  console.log(`Offer '${id}' is already paused.`);
  process.exit(0);
}

const next = {
  ...offer,
  status: 'paused',
  pausedAt: new Date().toISOString(),
  pauseReason: reason || 'manual pause',
  activatedAt: offer.activatedAt || null
};
fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);

// Pausing is intentionally fail-safe: never restore an active CTA just because an
// unrelated verification gate currently fails. The paused state remains written.
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const verify = spawnSync(npmCommand, ['run', 'verify'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VERIFY_PRODUCTION: process.env.PUBLIC_READY === 'true' ? 'true' : 'false'
  }
});

if (verify.status !== 0) {
  console.error(`Offer '${id}' remains PAUSED, but full-site verification failed. Fix the reported issue before the next deployment.`);
  process.exit(1);
}

console.log(`Paused '${id}'. Its affiliate CTA will render disabled after the next verified deployment.`);
