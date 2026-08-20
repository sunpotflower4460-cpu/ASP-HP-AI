import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

// Deterministic local-backup test. No network, API credential or GitHub Actions required.
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asp-hp-ai-selftest-'));
const fixtureRepo = path.join(fixtureRoot, 'repo');
const backupRoot = path.join(fixtureRoot, 'private-backups');
fs.mkdirSync(path.join(fixtureRepo, 'data', 'search-console'), { recursive: true });
fs.mkdirSync(path.join(fixtureRepo, 'data', 'analytics'), { recursive: true });
fs.mkdirSync(path.join(fixtureRepo, 'data', 'affiliate'), { recursive: true });
fs.mkdirSync(path.join(fixtureRepo, 'reports'), { recursive: true });
fs.writeFileSync(path.join(fixtureRepo, 'data', 'search-console', 'latest.json'), '{"rows":[]}\n');
fs.writeFileSync(path.join(fixtureRepo, 'data', 'analytics', 'latest.json'), '{"rows":[]}\n');
fs.writeFileSync(path.join(fixtureRepo, 'data', 'affiliate', 'normalized-latest.json'), '{"totals":{}}\n');
fs.writeFileSync(path.join(fixtureRepo, 'reports', 'latest.json'), '{"ok":true}\n');

const backupScript = path.resolve('scripts/local-backup-safe.mjs');
const verifyBackupScript = path.resolve('scripts/local-backup-verify.mjs');
const backupEnv = {
  ...process.env,
  LOCAL_BACKUP_DIR: backupRoot,
  LOCAL_BACKUP_RETENTION_DAYS: '30'
};

const backupResult = spawnSync(process.execPath, [backupScript], {
  cwd: fixtureRepo,
  env: backupEnv,
  encoding: 'utf8'
});
assert.equal(backupResult.status, 0, `local backup should succeed: ${backupResult.stderr || backupResult.stdout}`);
assert.ok(fs.existsSync(path.join(backupRoot, 'latest.json')), 'backup latest.json should exist');

const backupVerifyResult = spawnSync(process.execPath, [verifyBackupScript], {
  cwd: fixtureRepo,
  env: backupEnv,
  encoding: 'utf8'
});
assert.equal(backupVerifyResult.status, 0, `local backup verification should succeed: ${backupVerifyResult.stderr || backupVerifyResult.stdout}`);

const unsafeBackupResult = spawnSync(process.execPath, [backupScript], {
  cwd: fixtureRepo,
  env: { ...process.env, LOCAL_BACKUP_DIR: path.join(fixtureRepo, 'unsafe-backup') },
  encoding: 'utf8'
});
assert.notEqual(unsafeBackupResult.status, 0, 'backup inside public repository must be rejected');

// Deterministic Search Console content-gap planner test.
const gapScript = path.resolve('scripts/content-gap-plan.mjs');
const now = new Date().toISOString();
fs.writeFileSync(path.join(fixtureRepo, 'data', 'site.json'), JSON.stringify({ url: 'https://fixture.example' }, null, 2));
fs.writeFileSync(path.join(fixtureRepo, 'data', 'pages.json'), JSON.stringify([
  { id: 'p1', path: '/one/', name: 'One' },
  { id: 'p2', path: '/two/', name: 'Two' },
  { id: 'p3', path: '/three/', name: 'Three' }
], null, 2));
fs.writeFileSync(path.join(fixtureRepo, 'data', 'search-console', 'latest.json'), JSON.stringify({
  fetchedAt: now,
  rows: [
    { keys: ['同じ検索意図', 'https://fixture.example/one/'], impressions: 40, clicks: 2, ctr: 0.05, position: 8 },
    { keys: ['同じ検索意図', 'https://fixture.example/two/'], impressions: 35, clicks: 1, ctr: 0.0286, position: 10 },
    { keys: ['独立した新しい意図', 'https://fixture.example/three/'], impressions: 60, clicks: 1, ctr: 0.0167, position: 22 }
  ]
}, null, 2));

const gapResult = spawnSync(process.execPath, [gapScript], {
  cwd: fixtureRepo,
  env: {
    ...process.env,
    SITE_URL: 'https://fixture.example',
    CONTENT_GAP_MIN_IMPRESSIONS: '30',
    GSC_DATA_MAX_AGE_HOURS: '72'
  },
  encoding: 'utf8'
});
assert.equal(gapResult.status, 0, `content-gap planner should succeed: ${gapResult.stderr || gapResult.stdout}`);
const gapPlan = JSON.parse(fs.readFileSync(path.join(fixtureRepo, 'reports', 'content-gap-plan.json'), 'utf8'));
const cannibal = gapPlan.candidates.find((item) => item.type === 'CANNIBALIZATION_REVIEW');
const newPage = gapPlan.candidates.find((item) => item.type === 'NEW_PAGE_REVIEW');
assert.ok(cannibal, 'content-gap planner should detect cannibalization');
assert.ok(newPage, 'content-gap planner should surface a distinct new-page review');
assert.equal(newPage.autoCreateAllowed, false, 'new-page review must never auto-create a page');
assert.equal(cannibal.autoCreateAllowed, false, 'cannibalization review must never auto-create a page');

const stale = new Date(Date.now() - 100 * 3600000).toISOString();
fs.writeFileSync(path.join(fixtureRepo, 'data', 'search-console', 'latest.json'), JSON.stringify({
  fetchedAt: stale,
  rows: [{ keys: ['古いデータ', 'https://fixture.example/one/'], impressions: 1000, clicks: 0, ctr: 0, position: 25 }]
}, null, 2));
const staleGapResult = spawnSync(process.execPath, [gapScript], {
  cwd: fixtureRepo,
  env: {
    ...process.env,
    SITE_URL: 'https://fixture.example',
    CONTENT_GAP_MIN_IMPRESSIONS: '30',
    GSC_DATA_MAX_AGE_HOURS: '72'
  },
  encoding: 'utf8'
});
assert.equal(staleGapResult.status, 0, 'stale content-gap planner run should exit safely');
const stalePlan = JSON.parse(fs.readFileSync(path.join(fixtureRepo, 'reports', 'content-gap-plan.json'), 'utf8'));
assert.equal(stalePlan.candidates.length, 0, 'stale Search Console data must not produce content-gap candidates');

fs.rmSync(fixtureRoot, { recursive: true, force: true });
console.log(`Self-test passed. Scores: outbound=${outbound}, pending=${pending}, confirmed=${confirmed}, capped=${capped}; private backup and content-gap guards verified.`);
