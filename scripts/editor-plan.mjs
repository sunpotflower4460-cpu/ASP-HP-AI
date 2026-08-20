import './lib/load-local-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const readJson = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
const report = readJson('reports/latest.json');
const policy = readJson('data/editor-policy.json') || { maxDailyCandidates: 2 };
const site = readJson('data/site.json') || {};
if (!report) {
  console.log('No daily report; editor plan skipped.');
  process.exit(0);
}

function pageUrlToFile(target) {
  if (!target) return null;
  try {
    const base = site.url || process.env.SITE_URL || 'https://example.com';
    const pathname = new URL(target, base).pathname.replace(/\/+$/, '') || '/';
    if (pathname === '/') return 'src/pages/index.astro';
    const candidate = path.join('src/pages', `${pathname.replace(/^\//, '')}.astro`);
    return fs.existsSync(candidate) ? candidate : null;
  } catch { return null; }
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function topOpportunityForPage(targetUrl) {
  return (report.opportunities || [])
    .filter((x) => x.page === targetUrl)
    .sort((a, b) => Number(b.impressions || 0) - Number(a.impressions || 0))[0] || null;
}

function commercialSignalForPage(targetUrl) {
  return (report.commercialSignals || []).find((x) => x.page === targetUrl) || null;
}

const candidates = [];
for (const action of report.nextActions || []) {
  if (candidates.length >= Number(policy.maxDailyCandidates || 2)) break;
  const supported = ['REVIEW_TITLE', 'REVIEW_CONTENT', 'IMPROVE_OUTBOUND', 'AMPLIFY_COMMERCIAL_INTENT'];
  if (!supported.includes(action.type)) continue;

  const targetFile = pageUrlToFile(action.target);
  if (!targetFile) continue;
  const opportunity = action.query
    ? (report.opportunities || []).find((x) => x.page === action.target && x.query === action.query)
    : topOpportunityForPage(action.target);
  const commercial = commercialSignalForPage(action.target);

  if (action.type === 'REVIEW_TITLE' && (!opportunity || opportunity.impressions < Number(policy.minImpressionsForTitleReview || 20))) continue;

  const kind = action.type === 'REVIEW_TITLE' ? 'title' : 'content';
  const editorGoal = action.type === 'IMPROVE_OUTBOUND'
    ? 'Search traffic reaches this page but affiliate outbound clicks are weak. Improve decision support, comparison progression, and context around the existing compliant CTA without inventing claims or adding unverified offers.'
    : action.type === 'AMPLIFY_COMMERCIAL_INTENT'
      ? 'This page shows commercial intent through outbound affiliate clicks. Preserve the useful intent and improve clarity around decision criteria; do not fabricate urgency, rankings, or product facts.'
      : action.type === 'REVIEW_TITLE'
        ? 'Improve search-result relevance and clarity for the observed query while preserving factual meaning.'
        : 'Improve the page section(s) that answer the observed search intent without expanding into unsupported claims.';

  const protectedByRevenue = Boolean(action.protectedByRevenue || commercial?.confirmedYen > 0);
  candidates.push({
    id: `${action.type}:${targetFile}:${action.query || 'page'}`,
    actionType: action.type,
    kind,
    priority: Number(action.priority || 0),
    targetUrl: action.target,
    targetFile,
    sourceSha256: sha256File(targetFile),
    query: action.query || opportunity?.query || null,
    editorGoal,
    protectedByRevenue,
    risk: kind === 'title' ? 'medium' : 'medium',
    requiresAI: true,
    autoApplyAllowed: action.type === 'REVIEW_TITLE' && !protectedByRevenue && policy.autoApply?.title === true,
    evidence: {
      clicks: Number(opportunity?.clicks || commercial?.searchClicks || 0),
      impressions: Number(opportunity?.impressions || commercial?.impressions || 0),
      ctr: opportunity?.ctr ?? null,
      position: opportunity?.position ?? null,
      affiliateClicks: Number(commercial?.affiliateClicks ?? opportunity?.affiliateClicks ?? 0),
      outboundClicksPerSearchClick: commercial?.outboundClicksPerSearchClick ?? null,
      commercialIntentScore: Number(commercial?.intentScore ?? opportunity?.commercialIntentScore ?? 0),
      commercialIntentClass: commercial?.intentClass ?? opportunity?.commercialIntentClass ?? 'weak',
      confirmedYen: Number(commercial?.confirmedYen || 0),
      pendingYen: Number(commercial?.pendingYen || 0)
    }
  });
}

const output = { generatedAt: new Date().toISOString(), candidates };
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/editor-plan.json', JSON.stringify(output, null, 2));
console.log(`Editor plan contains ${candidates.length} candidate(s).`);
