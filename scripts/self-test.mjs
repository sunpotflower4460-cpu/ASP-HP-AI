import assert from 'node:assert/strict';
import { scoreCommercialIntent, classifyCommercialIntent } from './lib/commercial-intent.mjs';

const zero = scoreCommercialIntent({});
assert.equal(zero, 0, 'empty signal should score 0');
assert.equal(classifyCommercialIntent({ score: zero }), 'weak');

const outbound = scoreCommercialIntent({ searchClicks: 40, affiliateClicks: 8 });
assert.ok(outbound >= 35, `outbound signal should be at least promising, got ${outbound}`);
assert.notEqual(classifyCommercialIntent({ score: outbound }), 'weak');

const pending = scoreCommercialIntent({ searchClicks: 30, affiliateClicks: 4, pendingYen: 9000 });
assert.equal(classifyCommercialIntent({ score: pending, pendingYen: 9000 }), 'strong');

const confirmed = scoreCommercialIntent({ searchClicks: 3, affiliateClicks: 1, confirmedYen: 9000 });
assert.equal(classifyCommercialIntent({ score: confirmed, confirmedYen: 9000 }), 'proven');

const capped = scoreCommercialIntent({ searchClicks: 1, affiliateClicks: 100000, confirmedYen: 999999 });
assert.ok(capped <= 100, `score must be capped at 100, got ${capped}`);

console.log(`Self-test passed. Scores: outbound=${outbound}, pending=${pending}, confirmed=${confirmed}, capped=${capped}.`);
