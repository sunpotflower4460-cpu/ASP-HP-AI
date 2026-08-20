import './lib/load-local-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const production = process.env.VERIFY_PRODUCTION === 'true';
const startedAt = new Date().toISOString();
const report = {
  startedAt,
  finishedAt: null,
  production,
  publicReady: process.env.PUBLIC_READY === 'true',
  branch: process.env.CF_PAGES_BRANCH || process.env.GIT_BRANCH || null,
  commitSha: process.env.CF_PAGES_COMMIT_SHA || process.env.GIT_COMMIT_SHA || null,
  steps: [],
  ok: false
};

fs.mkdirSync('reports', { recursive: true });

function persist() {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join('reports', 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
}

function run(name, args, extraEnv = {}) {
  const step = { name, command: `npm ${args.join(' ')}`, startedAt: new Date().toISOString(), ok: false };
  report.steps.push(step);
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(npmCommand, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv }
  });
  step.finishedAt = new Date().toISOString();
  step.exitCode = result.status ?? 1;
  step.ok = result.status === 0;
  if (!step.ok) {
    report.failedStep = name;
    persist();
    console.error(`\nVerification failed at: ${name}`);
    process.exit(step.exitCode || 1);
  }
}

run('Deterministic analysis self-test', ['run', 'self-test']);
run('Tracked secret scan', ['run', 'security']);
run(production ? 'Strict launch readiness' : 'Launch readiness report', ['run', 'readiness'], production ? { READINESS_STRICT: 'true' } : {});
run('Astro type/content check', ['run', 'check']);
run('Build + content/freshness/smoke gates', ['run', 'build']);

report.ok = true;
persist();
console.log(`\nVerification passed. Mode: ${production ? 'production-strict' : 'safe-preview/local'}.`);
