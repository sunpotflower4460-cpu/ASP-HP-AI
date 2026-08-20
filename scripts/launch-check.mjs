import './lib/load-local-env.mjs';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const report = {
  startedAt: new Date().toISOString(),
  finishedAt: null,
  ok: false,
  steps: []
};
fs.mkdirSync('reports', { recursive: true });

function persist() {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync('reports/launch-check.json', `${JSON.stringify(report, null, 2)}\n`);
}

function run(name, args, extraEnv = {}) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(npmCommand, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv }
  });
  const step = { name, command: `npm ${args.join(' ')}`, exitCode: result.status ?? 1, ok: result.status === 0 };
  report.steps.push(step);
  if (!step.ok) {
    report.failedStep = name;
    persist();
    process.exit(step.exitCode || 1);
  }
}

// This is intentionally stricter than normal local development. It checks that
// the machine can safely run the automation and that all public-launch-required
// site/offer metadata is ready. PUBLIC_READY itself may still be false so the
// final preview can remain noindex until the operator explicitly enables it.
run('Local environment doctor', ['run', 'local:doctor']);
run('Strict public-launch prerequisites', ['run', 'readiness'], { READINESS_STRICT: 'true' });
run('Full verification gates', ['run', 'verify'], { VERIFY_PRODUCTION: 'true' });

report.ok = true;
persist();
console.log('\nLaunch check passed. Keep PUBLIC_READY=false until the final Cloudflare preview has been visually reviewed; then enable PUBLIC_READY=true only in production.');
