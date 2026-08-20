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

  const stalePayload = {
    schemaVersion: 1,
    runId: 'abandoned-test-lock',
    pid: 999999,
    hostname: 'fixture',
    startedAt: new Date(Date.now() - 10 * 3600000).toISOString()
  };
  fs.writeFileSync(lockPath, `${JSON.stringify(stalePayload)}\n`);
  const old = new Date(Date.now() - 10 * 3600000);
  fs.utimesSync(lockPath, old, old);

  const recovered = acquireRunLock({ lockPath, maxAgeHours: 6 });
  const recoveredPayload = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.notEqual(recoveredPayload.runId, 'abandoned-test-lock', 'stale lock must be replaced');
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
