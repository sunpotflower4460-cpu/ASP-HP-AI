import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireRunLock } from './lib/run-lock.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asp-hp-ai-lock-test-'));
const lockPath = path.join(root, 'daily.lock');

try {
  const first = acquireRunLock({ lockPath, maxAgeHours: 6, metadata: { test: true } });
  assert.ok(fs.existsSync(lockPath), 'first acquisition should create the lock');

  assert.throws(
    () => acquireRunLock({ lockPath, maxAgeHours: 6 }),
    /already locked/,
    'second acquisition must be rejected while the first lock is fresh'
  );

  first.release();
  assert.equal(fs.existsSync(lockPath), false, 'release should remove only its own lock');

  const old = new Date(Date.now() - 10 * 3600000);
  const liveOldPayload = {
    schemaVersion: 1,
    runId: 'live-old-lock',
    pid: process.pid,
    hostname: os.hostname(),
    startedAt: old.toISOString()
  };
  fs.writeFileSync(lockPath, `${JSON.stringify(liveOldPayload)}\n`);
  fs.utimesSync(lockPath, old, old);
  assert.throws(
    () => acquireRunLock({ lockPath, maxAgeHours: 6 }),
    /still alive/,
    'an old lock owned by a live same-host process must never be stolen'
  );
  fs.rmSync(lockPath, { force: true });

  const stalePayload = {
    schemaVersion: 1,
    runId: 'abandoned-test-lock',
    pid: 999999,
    hostname: os.hostname(),
    startedAt: old.toISOString()
  };
  fs.writeFileSync(lockPath, `${JSON.stringify(stalePayload)}\n`);
  fs.utimesSync(lockPath, old, old);

  const recovered = acquireRunLock({ lockPath, maxAgeHours: 6 });
  const recoveredPayload = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.notEqual(recoveredPayload.runId, 'abandoned-test-lock', 'stale dead-process lock must be replaced');
  recovered.release();

  assert.throws(
    () => acquireRunLock({ lockPath, maxAgeHours: 0 }),
    /maxAgeHours/,
    'invalid lock configuration must be rejected'
  );

  console.log('Run-lock test passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
