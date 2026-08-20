import fs from 'node:fs';

const readJson = (file) => {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; }
  catch { return null; }
};

const gsc = readJson('data/search-console/latest.json');
const site = readJson('data/site.json') || {};
const pages = readJson('data/pages.json') || [];
const maxAgeHours = Math.max(1, Number(process.env.GSC_DATA_MAX_AGE_HOURS || 72));
const minImpressions = Math.max(10, Number(process.env.CONTENT_GAP_MIN_IMPRESSIONS || 30));
const outputPath = 'reports/content-gap-plan.json';

fs.mkdirSync('reports', { recursive: true });

function writeOutput(reason, candidates = []) {
  const output = {
    generatedAt: new Date().toISOString(),
    reason,
    minImpressions,
    maxAgeHours,
    candidates
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Content-gap plan: ${candidates.length} candidate(s). ${reason}`);
}

if (!gsc?.rows?.length || !gsc.fetchedAt) {
  writeOutput('No Search Console data available.');
  process.exit(0);
}

const fetchedAtMs = Date.parse(gsc.fetchedAt);
const ageHours = Number.isFinite(fetchedAtMs) ? (Date.now() - fetchedAtMs) / 3600000 : Infinity;
if (ageHours > maxAgeHours) {
  writeOutput(`Search Console data is stale (${ageHours.toFixed(1)}h > ${maxAgeHours}h); no gap proposals generated.`);
  process.exit(0);
}

const siteBase = process.env.SITE_URL || site.url || 'https://example.com';
const normalizePath = (value) => {
  try {
    const url = new URL(value, siteBase);
    return url.pathname === '/' ? '/' : `${url.pathname.replace(/\/+$/, '')}/`;
  } catch {
    const raw = String(value || '/').split('?')[0].split('#')[0];
    return raw === '/' ? '/' : `/${raw.replace(/^\/+|\/+$/g, '')}/`;
  }
};
const pageByPath = new Map(pages.map((page) => [page.path, page]));
const groups = new Map();

for (const row of gsc.rows || []) {
  const query = String(row.keys?.[0] || '').replace(/\s+/g, ' ').trim();
  const pageRaw = row.keys?.[1];
  const impressions = Number(row.impressions || 0);
  if (!query || query.length < 2 || !pageRaw || impressions <= 0) continue;

  const key = query.toLocaleLowerCase('ja-JP');
  const current = groups.get(key) || {
    query,
    impressions: 0,
    clicks: 0,
    weightedPosition: 0,
    pages: new Map()
  };
  const clicks = Number(row.clicks || 0);
  const position = Number(row.position || 0);
  const pagePath = normalizePath(pageRaw);
  current.impressions += impressions;
  current.clicks += clicks;
  current.weightedPosition += position * impressions;

  const page = current.pages.get(pagePath) || { pagePath, impressions: 0, clicks: 0, weightedPosition: 0 };
  page.impressions += impressions;
  page.clicks += clicks;
  page.weightedPosition += position * impressions;
  current.pages.set(pagePath, page);
  groups.set(key, current);
}

const candidates = [];
for (const group of groups.values()) {
  if (group.impressions < minImpressions) continue;
  const avgPosition = group.weightedPosition / group.impressions;
  const ctr = group.clicks / group.impressions;
  const pageRows = [...group.pages.values()]
    .map((row) => ({
      ...row,
      position: row.impressions ? Number((row.weightedPosition / row.impressions).toFixed(2)) : null,
      pageId: pageByPath.get(row.pagePath)?.id || null,
      pageName: pageByPath.get(row.pagePath)?.name || null
    }))
    .sort((a, b) => b.impressions - a.impressions);

  const significantPages = pageRows.filter((row) => row.impressions >= Math.max(10, minImpressions * 0.2));
  let type = null;
  let rationale = '';

  if (significantPages.length >= 2) {
    type = 'CANNIBALIZATION_REVIEW';
    rationale = 'The same query is receiving meaningful impressions on multiple pages; review whether one page should become the clear primary answer or pages should be consolidated.';
  } else if (avgPosition >= 4 && avgPosition <= 15) {
    type = 'EXPAND_EXISTING';
    rationale = 'An existing page is already close to stronger visibility; prefer improving that page before creating a new one.';
  } else if (avgPosition > 15 && avgPosition <= 50 && ctr < 0.03) {
    type = 'NEW_PAGE_REVIEW';
    rationale = 'Demand is visible but the current ranking page is weak. Review whether the intent is distinct enough to deserve one new page; do not auto-create it.';
  }

  if (!type) continue;
  const priority = Math.round(
    Math.min(100, Math.log10(group.impressions + 1) * 20 + (type === 'CANNIBALIZATION_REVIEW' ? 25 : type === 'NEW_PAGE_REVIEW' ? 20 : 10))
  );
  candidates.push({
    type,
    priority,
    query: group.query,
    impressions: group.impressions,
    clicks: group.clicks,
    ctr: Number(ctr.toFixed(4)),
    position: Number(avgPosition.toFixed(2)),
    rationale,
    existingPages: pageRows.slice(0, 5),
    autoCreateAllowed: false
  });
}

candidates.sort((a, b) => b.priority - a.priority || b.impressions - a.impressions);
writeOutput('Search Console query/page clusters reviewed. New pages are proposal-only.', candidates.slice(0, 30));
