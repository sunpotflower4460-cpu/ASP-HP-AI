import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

function parseJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function isProcessAlive(pid) {
  const numeric = Number(pid);
  if (!Number.isInteger(numeric) || numeric <= 0) return false;
  try {
    process.kill(numeric, 0);
    return true;
  } catch (error) {
    // EPERM means a process exists but cannot be signalled by this user.
    return error?.code === 'EPERM';
  }
}

export function acquireRunLock({ lockPath, maxAgeHours = 6, metadata = {} }) {
  const resolved = path.resolve(lockPath);
  const maxHours = Number(maxAgeHours);
  if (!Number.isFinite(maxHours) || maxHours <= 0 || maxHours > 168) {
    throw new Error('Run-lock maxAgeHours must be > 0 and <= 168.');
  }

  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const runId = crypto.randomUUID();
  const hostname = os.hostname();
  const payload = {
    schemaVersion: 1,
    runId,
    pid: process.pid,
    hostname,
    startedAt: new Date().toISOString(),
    ...metadata
  };

  function writeExclusive() {
    const fd = fs.openSync(resolved, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`);
    } finally {
      fs.closeSync(fd);
    }
  }

  try {
    writeExclusive();
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;

    let ageMs = 0;
    try { ageMs = Date.now() - fs.statSync(resolved).mtimeMs; } catch {}
    const existing = parseJson(resolved);
    const staleByAge = ageMs > maxHours * 3600000;
    const sameHostProcessAlive = existing?.hostname === hostname && isProcessAlive(existing?.pid);

    if (!staleByAge || sameHostProcessAlive) {
      const description = existing
        ? `pid=${existing.pid ?? '?'} host=${existing.hostname ?? '?'} startedAt=${existing.startedAt ?? '?'}`
        : 'unreadable existing lock';
      const suffix = sameHostProcessAlive ? ' process is still alive' : '';
      throw new Error(`Another local daily run is already locked (${description};${suffix || ' lock is still fresh'}).`);
    }

    // Recover an abandoned lock once, then use O_EXCL again so concurrent
    // recoveries cannot both proceed. A live same-host process is never stolen.
    fs.rmSync(resolved, { force: true });
    writeExclusive();
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      const current = parseJson(resolved);
      if (current?.runId === runId) fs.rmSync(resolved, { force: true });
    } catch {}
  };

  process.once('exit', release);
  return { runId, lockPath: resolved, release };
}
