import fs from 'node:fs';

const readJson = (file) => {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; }
  catch { return null; }
};
const latest = readJson('reports/latest.json');
const readiness = readJson('reports/readiness.json');
const verification = readJson('reports/verification.json');
const editorPlan = readJson('reports/editor-plan.json');

const revenue = latest?.revenue || {};
const signals = (latest?.commercialSignals || []).slice(0, 8);
const actions = (latest?.nextActions || []).slice(0, 8);
const readinessFailures = (readiness?.checks || []).filter((x) => x.level === 'required' && !x.ok);
const verifyStatus = verification?.ok === true ? 'PASS' : verification ? 'FAIL' : 'NOT RUN';
const launchStatus = readiness?.readyForPublicLaunch ? 'READY' : 'NOT READY';

const yen = (value) => `¥${Number(value || 0).toLocaleString('ja-JP')}`;
const pct = (value) => value == null ? '-' : `${(Number(value) * 100).toFixed(1)}%`;
const lines = [
  '# ASP-HP-AI Operations Summary',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Status',
  '',
  `- Verification: **${verifyStatus}**`,
  `- Public-launch readiness: **${launchStatus}**`,
  `- PUBLIC_READY: **${verification?.publicReady === true ? 'true' : 'false'}**`,
  `- Editor candidates: **${(editorPlan?.candidates || []).length}**`,
  '',
  '## Revenue',
  '',
  `- Confirmed: **${yen(revenue.confirmedYen)}**`,
  `- Pending: **${yen(revenue.pendingYen)}**`,
  `- Rejected: **${yen(revenue.rejectedYen)}**`,
  `- Normalized events: **${Number(revenue.events || 0)}**`,
  `- GA4 affiliate_click (28d): **${Number(latest?.traffic?.totalAffiliateClicks || 0)}**`,
  '',
  '## Top commercial signals',
  ''
];

if (signals.length) {
  lines.push('| Page | Intent | Class | Search clicks | Affiliate clicks | Outbound/Search | Confirmed | Pending |');
  lines.push('|---|---:|---|---:|---:|---:|---:|---:|');
  for (const row of signals) {
    lines.push(`| ${row.pagePath || row.page || '-'} | ${Number(row.intentScore || 0)} | ${row.intentClass || '-'} | ${Number(row.searchClicks || 0)} | ${Number(row.affiliateClicks || 0)} | ${pct(row.outboundClicksPerSearchClick)} | ${yen(row.confirmedYen)} | ${yen(row.pendingYen)} |`);
  }
} else {
  lines.push('_No commercial signal data yet._');
}

lines.push('', '## Next actions', '');
if (actions.length) {
  for (const action of actions) lines.push(`- **${action.type}** — ${action.target || '-'}${action.reason ? ` — ${action.reason}` : ''}`);
} else {
  lines.push('_No next actions yet._');
}

lines.push('', '## Required readiness gaps', '');
if (readinessFailures.length) {
  for (const item of readinessFailures) lines.push(`- ${item.id}: ${item.message}`);
} else {
  lines.push('_None._');
}

if (verification?.failedStep) {
  lines.push('', '## Verification failure', '', `- Failed step: **${verification.failedStep}**`);
}

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/ops-summary.md', `${lines.join('\n')}\n`);
console.log('Wrote reports/ops-summary.md');
