import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const report = {
  startedAt: new Date().toISOString(),
  finishedAt: null,
  ok: false,
  degraded: false,
  steps: []
};
fs.mkdirSync('reports', { recursive: true });

function persist() {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync('reports/daily-run.json', `${JSON.stringify(report, null, 2)}\n`);
}

function run(name, script, { optional = false } = {}) {
  console.log(`\n=== ${name} ===`);
  const startedAt = new Date().toISOString();
  const result = spawnSync(npmCommand, ['run', script], { stdio: 'inherit', env: process.env });
  const step = {
    name,
    script,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: result.status ?? 1,
    ok: result.status === 0,
    optional
  };
  report.steps.push(step);
  if (!step.ok && optional) {
    report.degraded = true;
    console.warn(`${name} failed; continuing with previously saved data where available.`);
    return false;
  }
  if (!step.ok) {
    report.failedStep = name;
    persist();
    process.exit(step.exitCode || 1);
  }
  return true;
}

function removeStaleProposal() {
  const proposalPath = 'reports/ai-editor-proposal.json';
  if (fs.existsSync(proposalPath)) fs.rmSync(proposalPath);
}

// Never permit a previous run's proposal to be applied by this run.
removeStaleProposal();

// Network/API collection is best-effort. A transient provider outage should not erase observation history.
run('Search Console fetch', 'gsc:fetch', { optional: true });
run('GA4 affiliate-click fetch', 'ga:fetch', { optional: true });
run('ValueCommerce fetch', 'vc:fetch', { optional: true });

// Local deterministic processing is required.
run('Affiliate normalization', 'affiliate:normalize');
run('Daily analysis', 'analyze');
run('Editor planning', 'editor:plan');

if (report.degraded) {
  console.warn('Daily observations are degraded; AI editing is disabled for this run.');
  removeStaleProposal();
  report.aiEditingSkippedBecauseDegraded = true;
} else if (process.env.AI_EDITOR_ENABLED === 'true') {
  const aiOk = run('Optional AI proposal', 'editor:ai', { optional: true });
  if (aiOk && fs.existsSync('reports/ai-editor-proposal.json')) {
    run('Optional safe title application', 'editor:apply', { optional: true });
  } else {
    removeStaleProposal();
  }
} else {
  console.log('AI editor is disabled; no proposal will be generated or applied.');
  removeStaleProposal();
}

report.ok = true;
persist();
console.log(`\nDaily run completed${report.degraded ? ' in degraded observation mode' : ''}.`);
