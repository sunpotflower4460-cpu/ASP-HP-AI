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

// This is intentionally stricter than normal local development. Initial launch
// requires at least one verified active offer. Ongoing production deploys do not,
// so ended offers can always be removed safely after launch.
const initialLaunchEnv = {
  READINESS_STRICT: 'true',
  REQUIRE_ACTIVE_OFFER_FOR_LAUNCH: 'true'
};
run('Local environment doctor', ['run', 'local:doctor']);
run('Strict initial-launch prerequisites', ['run', 'readiness'], initialLaunchEnv);
run('Full verification gates', ['run', 'verify'], {
  VERIFY_PRODUCTION: 'true',
  REQUIRE_ACTIVE_OFFER_FOR_LAUNCH: 'true'
});

report.ok = true;
persist();
console.log('\nLaunch check passed. Keep PUBLIC_READY=false until the final Cloudflare preview has been visually reviewed; then enable PUBLIC_READY=true only in production.');
