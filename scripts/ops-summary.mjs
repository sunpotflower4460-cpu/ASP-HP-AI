import fs from 'node:fs';

const readJson = (file) => {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; }
  catch { return null; }
};
const latest = readJson('reports/latest.json');
const readiness = readJson('reports/readiness.json');
const verification = readJson('reports/verification.json');
const editorPlan = readJson('reports/editor-plan.json');
const contentGapPlan = readJson('reports/content-gap-plan.json');
const dailyRun = readJson('reports/daily-run.json');
const gscObservation = readJson('data/search-console/latest.json');

const revenue = latest?.revenue || {};
const signals = (latest?.commercialSignals || []).slice(0, 8);
const actions = (latest?.nextActions || []).slice(0, 8);
const gapCandidates = (contentGapPlan?.candidates || []).slice(0, 8);
const readinessFailures = (readiness?.checks || []).filter((x) => x.level === 'required' && !x.ok);
const verifyStatus = verification?.ok === true ? 'PASS' : verification ? 'FAIL' : 'NOT RUN';
const launchStatus = readiness?.readyForPublicLaunch ? 'READY' : 'NOT READY';
const dailyStatus = dailyRun?.ok === true ? (dailyRun.degraded ? 'DEGRADED' : 'PASS') : dailyRun ? 'FAIL' : 'NOT RUN';
const gscFreshness = latest?.sourceFreshness?.searchConsole || null;
const gaFreshness = latest?.sourceFreshness?.analytics || null;
const gscPaging = gscObservation?.pagination || null;

const yen = (value) => value == null ? '-' : `¥${Number(value || 0).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}`;
const pct = (value) => value == null ? '-' : `${(Number(value) * 100).toFixed(1)}%`;
const freshnessLabel = (value) => {
  if (!value) return 'unknown';
  if (!value.fresh) return `STALE${value.ageHours == null ? '' : ` (${value.ageHours}h)`}`;
  return `fresh${value.ageHours == null ? '' : ` (${value.ageHours}h)`}`;
};
const lines = [
  '# ASP-HP-AI Operations Summary',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Status',
  '',
  `- Daily run: **${dailyStatus}**`,
  `- Verification: **${verifyStatus}**`,
  `- Public-launch readiness: **${launchStatus}**`,
  `- PUBLIC_READY: **${verification?.publicReady === true ? 'true' : 'false'}**`,
  `- Search Console data: **${freshnessLabel(gscFreshness)}**`,
  `- GA4 data: **${freshnessLabel(gaFreshness)}**`,
  `- GSC rows/pages: **${Number(gscPaging?.totalRows ?? (gscObservation?.rows || []).length)} rows / ${gscPaging?.pagesFetched ?? '-'} page(s)**`,
  `- GSC terminal page reached: **${gscPaging?.terminalPageReached === true ? 'yes' : gscPaging ? 'no' : 'unknown'}**`,
  '- GSC query/page exhaustiveness: **best-effort only** (Search Console internal limits can omit rows)',
  `- AI editing skipped because degraded observations: **${dailyRun?.aiEditingSkippedBecauseDegraded === true ? 'yes' : 'no'}**`,
  `- Editor candidates: **${(editorPlan?.candidates || []).length}**`,
  `- Content-gap review candidates: **${(contentGapPlan?.candidates || []).length}**`,
  '',
  '## Revenue',
  '',
  `- Confirmed: **${yen(revenue.confirmedYen)}**`,
  `- Pending: **${yen(revenue.pendingYen)}**`,
  `- Rejected: **${yen(revenue.rejectedYen)}**`,
  `- Normalized events: **${Number(revenue.events || 0)}**`,
  `- GA4 affiliate_click (28d, fresh data only): **${Number(latest?.traffic?.totalAffiliateClicks || 0)}**`,
  '',
  '## Top commercial signals',
  ''
];

if (signals.length) {
  lines.push('| Page | Intent | Class | Search clicks | Affiliate clicks | Outbound/Search | Confirmed | ¥/Search click | ¥/Affiliate click | Pending |');
  lines.push('|---|---:|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of signals) {
    lines.push(`| ${row.pagePath || row.page || '-'} | ${Number(row.intentScore || 0)} | ${row.intentClass || '-'} | ${Number(row.searchClicks || 0)} | ${Number(row.affiliateClicks || 0)} | ${pct(row.outboundClicksPerSearchClick)} | ${yen(row.confirmedYen)} | ${yen(row.confirmedYenPerSearchClick)} | ${yen(row.confirmedYenPerAffiliateClick)} | ${yen(row.pendingYen)} |`);
  }
} else {
  lines.push('_No commercial signal data yet._');
}

lines.push('', '## Search intent / content-gap review', '');
if (gapCandidates.length) {
  lines.push('| Type | Query | Impressions | Clicks | CTR | Position | Auto-create |');
  lines.push('|---|---|---:|---:|---:|---:|---|');
  for (const row of gapCandidates) {
    lines.push(`| ${row.type || '-'} | ${String(row.query || '-').replace(/\|/g, '\\|')} | ${Number(row.impressions || 0)} | ${Number(row.clicks || 0)} | ${pct(row.ctr)} | ${Number(row.position || 0).toFixed(1)} | ${row.autoCreateAllowed === true ? 'yes' : 'no'} |`);
  }
  lines.push('', '_NEW_PAGE_REVIEW is proposal-only. The system never auto-creates pages from Search Console queries._');
} else {
  lines.push('_No content-gap candidates yet._');
}

lines.push('', '## Next actions', '');
if (actions.length) {
  for (const action of actions) lines.push(`- **${action.type}** — ${action.target || '-'}${action.reason ? ` — ${action.reason}` : ''}`);
} else {
  lines.push('_No next actions yet._');
}

const degradedSteps = (dailyRun?.steps || []).filter((step) => step.optional && !step.ok);
if (degradedSteps.length) {
  lines.push('', '## Degraded observations', '');
  for (const step of degradedSteps) lines.push(`- ${step.name}: exit ${step.exitCode}`);
}
if ((gscFreshness && !gscFreshness.fresh) || (gaFreshness && !gaFreshness.fresh)) {
  lines.push('', '## Stale observation guard', '');
  if (gscFreshness && !gscFreshness.fresh) lines.push('- Search Console is stale: SEO edit opportunities and content-gap proposals are suppressed until fresh data is fetched.');
  if (gaFreshness && !gaFreshness.fresh) lines.push('- GA4 is stale: outbound-click gap/amplification decisions are suppressed until fresh data is fetched.');
}
if (gscPaging && gscPaging.terminalPageReached !== true) {
  lines.push('', '## Search Console paging guard', '', '- Latest GSC observation did not record a terminal page. Treat it as incomplete and review `GSC_MAX_PAGES` / fetch logs before using it for editorial decisions.');
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
if (dailyRun?.failedStep) {
  lines.push('', '## Daily-run failure', '', `- Failed step: **${dailyRun.failedStep}**`);
}

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/ops-summary.md', `${lines.join('\n')}\n`);
console.log('Wrote reports/ops-summary.md');
