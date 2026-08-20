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
const next = { ...offer, status: 'active', activatedAt: new Date().toISOString() };
fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);

function run(script) {
  return spawnSync(process.execPath, [script], { stdio: 'inherit', env: process.env });
}
const validate = run('scripts/validate-content.mjs');
const freshness = validate.status === 0 ? run('scripts/check-freshness.mjs') : validate;
if (validate.status !== 0 || freshness.status !== 0) {
  fs.writeFileSync(file, original);
  throw new Error(`Activation rolled back because validation failed for '${id}'.`);
}
console.log(`Activated '${id}'. Run npm run build before public deployment.`);
