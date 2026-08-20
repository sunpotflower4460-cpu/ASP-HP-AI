import fs from 'node:fs';
import path from 'node:path';

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

const candidates = [];
for (const action of report.nextActions || []) {
  if (candidates.length >= Number(policy.maxDailyCandidates || 2)) break;
  if (action.type !== 'REVIEW_TITLE' && action.type !== 'REVIEW_CONTENT') continue;
  const opportunity = (report.opportunities || []).find((x) => x.page === action.target && x.query === action.query);
  if (!opportunity) continue;
  const targetFile = pageUrlToFile(action.target);
  if (!targetFile) continue;

  if (action.type === 'REVIEW_TITLE' && opportunity.impressions < Number(policy.minImpressionsForTitleReview || 20)) continue;
  candidates.push({
    id: `${action.type}:${targetFile}:${action.query}`,
    kind: action.type === 'REVIEW_TITLE' ? 'title' : 'content',
    targetUrl: action.target,
    targetFile,
    query: action.query,
    protectedByRevenue: Boolean(action.protectedByRevenue),
    risk: action.type === 'REVIEW_TITLE' ? 'medium' : 'medium',
    requiresAI: true,
    autoApplyAllowed: action.type === 'REVIEW_TITLE' && !action.protectedByRevenue && policy.autoApply?.title === true,
    evidence: {
      clicks: opportunity.clicks,
      impressions: opportunity.impressions,
      ctr: opportunity.ctr,
      position: opportunity.position
    }
  });
}

const output = { generatedAt: new Date().toISOString(), candidates };
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/editor-plan.json', JSON.stringify(output, null, 2));
console.log(`Editor plan contains ${candidates.length} candidate(s).`);
