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

fs.rmSync(fixtureRoot, { recursive: true, force: true });
console.log(`Self-test passed. Scores: outbound=${outbound}, pending=${pending}, confirmed=${confirmed}, capped=${capped}; private backup round-trip verified.`);
