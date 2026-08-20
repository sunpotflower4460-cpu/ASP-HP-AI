import './lib/load-local-env.mjs';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { evaluateOffer, loadOffer } from './lib/offer-tools.mjs';

const id = process.argv[2];
const confirmed = process.argv.includes('--confirm-rules-reviewed');
if (!id) {
  console.error('Usage: npm run offer:activate -- <offer-id> --confirm-rules-reviewed');
  process.exit(1);
}
if (!confirmed) {
  console.error('Activation requires --confirm-rules-reviewed after you personally verify ASP/media rules and current offer facts.');
  process.exit(1);
}

const { file, offer } = loadOffer(id);
if (offer.status === 'active') {
  console.log(`Offer '${id}' is already active.`);
  process.exit(0);
}
const result = evaluateOffer(offer);
if (!result.ready) {
  for (const check of result.requiredFailures) console.error(`FAIL ${check.id}: ${check.message}`);
  throw new Error(`Offer '${id}' is not ready for activation.`);
}

const original = fs.readFileSync(file, 'utf8');
const next = {
  ...offer,
  status: 'active',
  activatedAt: new Date().toISOString(),
  pausedAt: null,
  pauseReason: null
};
fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const verify = spawnSync(npmCommand, ['run', 'verify'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VERIFY_PRODUCTION: process.env.PUBLIC_READY === 'true' ? 'true' : 'false'
  }
});
if (verify.status !== 0) {
  fs.writeFileSync(file, original);
  throw new Error(`Activation rolled back because full-site verification failed for '${id}'.`);
}
console.log(`Activated '${id}' after full-site verification. Deploy only through the normal Cloudflare build gate.`);
