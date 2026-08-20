import './lib/load-local-env.mjs';
import fs from 'node:fs';
import { scoreCommercialIntent, classifyCommercialIntent } from './lib/commercial-intent.mjs';

const readJson = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
const gsc = readJson('data/search-console/latest.json');
const analytics = readJson('data/analytics/latest.json');
const affiliate = readJson('data/affiliate/normalized-latest.json');
const pages = readJson('data/pages.json') || [];
const site = readJson('data/site.json') || {};
const siteBase = process.env.SITE_URL || site.url || 'https://example.com';
const pageById = new Map(pages.map((page) => [page.id, page]));

function freshness(timestamp, maxHours) {
  const parsed = Date.parse(timestamp || '');
  if (!Number.isFinite(parsed)) return { fresh: false, ageHours: null, maxHours };
  const ageHours = Math.max(0, (Date.now() - parsed) / 3600000);
  return { fresh: ageHours <= maxHours, ageHours: Number(ageHours.toFixed(1)), maxHours };
}
const gscFreshness = freshness(gsc?.fetchedAt, Math.max(1, Number(process.env.GSC_DATA_MAX_AGE_HOURS || 72)));
const analyticsFreshness = freshness(analytics?.fetchedAt, Math.max(1, Number(process.env.GA_DATA_MAX_AGE_HOURS || 72)));
const usableGscRows = gscFreshness.fresh ? (gsc?.rows || []) : [];
const usableAnalyticsRows = analyticsFreshness.fresh ? (analytics?.rows || []) : [];

const normalizePath = (value) => {
  try {
    const url = new URL(value, siteBase);
    return url.pathname === '/' ? '/' : `${url.pathname.replace(/\/+$/, '')}/`;
  } catch {
    const raw = String(value || '/').split('?')[0].split('#')[0];
    return raw === '/' ? '/' : `/${raw.replace(/^\/+|\/+$/g, '')}/`;
  }
};
const normalizeUrl = (value) => {
  try {
    const url = new URL(value, siteBase);
    return `${url.origin}${normalizePath(url.pathname)}`;
  } catch { return value; }
};
const pageIdToUrl = (id) => {
  const page = pageById.get(id);
  return page ? normalizeUrl(new URL(page.path, siteBase).toString()) : null;
};

const affiliateClicksByPath = new Map(
  usableAnalyticsRows.map((row) => [normalizePath(row.pagePath), Number(row.eventCount || 0)])
);

const searchByPath = new Map();
for (const row of usableGscRows) {
  const pagePath = normalizePath(row.keys?.[1]);
  const current = searchByPath.get(pagePath) || { clicks: 0, impressions: 0 };
  current.clicks += Number(row.clicks || 0);
  current.impressions += Number(row.impressions || 0);
  searchByPath.set(pagePath, current);
}

const affiliatePaths = (affiliate?.paths || []).filter((x) => x.pageId || x.offerId || x.programId).slice(0, 100);
const revenueByPath = new Map();
for (const row of affiliatePaths) {
  if (!row.pageId) continue;
  const url = pageIdToUrl(row.pageId);
  if (!url) continue;
  const pagePath = normalizePath(url);
  const current = revenueByPath.get(pagePath) || { confirmedYen: 0, pendingYen: 0, rejectedYen: 0 };
  current.confirmedYen += Number(row.confirmedYen || 0);
  current.pendingYen += Number(row.pendingYen || 0);
  current.rejectedYen += Number(row.rejectedYen || 0);
  revenueByPath.set(pagePath, current);
}

const allSignalPaths = new Set([
  ...searchByPath.keys(),
  ...affiliateClicksByPath.keys(),
  ...revenueByPath.keys()
]);
const commercialSignals = [...allSignalPaths].map((pagePath) => {
  const search = searchByPath.get(pagePath) || { clicks: 0, impressions: 0 };
  const revenue = revenueByPath.get(pagePath) || { confirmedYen: 0, pendingYen: 0, rejectedYen: 0 };
  const affiliateClicks = affiliateClicksByPath.get(pagePath) || 0;
  const score = scoreCommercialIntent({
    searchClicks: search.clicks,
    affiliateClicks,
    confirmedYen: revenue.confirmedYen,
    pendingYen: revenue.pendingYen
  });
  const className = classifyCommercialIntent({
    score,
    confirmedYen: revenue.confirmedYen,
    pendingYen: revenue.pendingYen
  });
  return {
    pagePath,
    page: normalizeUrl(pagePath),
    searchClicks: search.clicks,
    impressions: search.impressions,
    affiliateClicks,
    outboundClicksPerSearchClick: search.clicks > 0 ? Number((affiliateClicks / search.clicks).toFixed(4)) : null,
    confirmedYen: revenue.confirmedYen,
    pendingYen: revenue.pendingYen,
    rejectedYen: revenue.rejectedYen,
    confirmedYenPerSearchClick: search.clicks > 0 ? Number((revenue.confirmedYen / search.clicks).toFixed(2)) : null,
    confirmedYenPerAffiliateClick: affiliateClicks > 0 ? Number((revenue.confirmedYen / affiliateClicks).toFixed(2)) : null,
    pendingYenPerAffiliateClick: affiliateClicks > 0 ? Number((revenue.pendingYen / affiliateClicks).toFixed(2)) : null,
    intentScore: score,
    intentClass: className
  };
}).sort((a, b) =>
  (b.confirmedYen - a.confirmedYen) ||
  (b.pendingYen - a.pendingYen) ||
  (b.intentScore - a.intentScore) ||
  (b.affiliateClicks - a.affiliateClicks)
);
const signalByPath = new Map(commercialSignals.map((row) => [row.pagePath, row]));

const opportunities = usableGscRows
  .map((row) => {
    const page = normalizeUrl(row.keys?.[1]);
    const pagePath = normalizePath(row.keys?.[1]);
    const signal = signalByPath.get(pagePath);
    return {
      query: row.keys?.[0],
      page,
      pagePath,
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      ctr: Number(row.ctr || 0),
      position: Number(row.position || 0),
      affiliateClicks: signal?.affiliateClicks || 0,
      confirmedYen: signal?.confirmedYen || 0,
      confirmedYenPerSearchClick: signal?.confirmedYenPerSearchClick ?? null,
      confirmedYenPerAffiliateClick: signal?.confirmedYenPerAffiliateClick ?? null,
      commercialIntentScore: signal?.intentScore || 0,
      commercialIntentClass: signal?.intentClass || 'weak'
    };
  })
  .filter((r) => r.impressions >= 10 && r.position >= 4 && r.position <= 20)
  .map((r) => ({ ...r, action: r.impressions >= 20 && r.ctr < 0.03 ? 'REVIEW_TITLE' : 'REVIEW_CONTENT' }))
  .sort((a, b) =>
    (b.confirmedYen - a.confirmedYen) ||
    (b.commercialIntentScore - a.commercialIntentScore) ||
    (b.impressions - a.impressions)
  )
  .slice(0, 30);

const winners = affiliatePaths.filter((x) => x.confirmedYen > 0);
const pending = affiliatePaths.filter((x) => x.confirmedYen === 0 && x.pendingYen > 0);
const protectedPageIds = new Set(winners.map((x) => x.pageId).filter(Boolean));
const protectedUrls = new Set([...protectedPageIds].map(pageIdToUrl).filter(Boolean));
const protectedPages = [...protectedPageIds].map((pageId) => ({ pageId, page: pageById.get(pageId) || null, url: pageIdToUrl(pageId) }));

const outboundGaps = analyticsFreshness.fresh
  ? commercialSignals.filter((x) => x.searchClicks >= 20 && x.affiliateClicks === 0 && x.confirmedYen === 0).slice(0, 5)
  : [];
const strongUnconfirmed = analyticsFreshness.fresh
  ? commercialSignals.filter((x) => x.intentScore >= 55 && x.affiliateClicks >= 3 && x.confirmedYen === 0).slice(0, 5)
  : [];

const nextActions = [
  ...winners.slice(0, 5).map((x) => ({ type: 'PROTECT_WINNER', target: pageIdToUrl(x.pageId) || x.offerId || x.programName, pageId: x.pageId || null, priority: 100, reason: `confirmed reward ¥${x.confirmedYen}` })),
  ...pending.slice(0, 5).map((x) => ({ type: 'MONITOR_PENDING', target: pageIdToUrl(x.pageId) || x.offerId || x.programName, pageId: x.pageId || null, priority: 90, reason: `pending reward ¥${x.pendingYen}` })),
  ...strongUnconfirmed.map((x) => ({ type: 'AMPLIFY_COMMERCIAL_INTENT', target: x.page, pagePath: x.pagePath, priority: 75 + Math.min(15, Math.floor(x.intentScore / 10)), intentScore: x.intentScore, affiliateClicks: x.affiliateClicks, reason: `${x.affiliateClicks} outbound click(s), no confirmed reward yet` })),
  ...outboundGaps.map((x) => ({ type: 'IMPROVE_OUTBOUND', target: x.page, pagePath: x.pagePath, priority: 70, intentScore: x.intentScore, searchClicks: x.searchClicks, reason: `${x.searchClicks} search click(s) but 0 outbound affiliate clicks` })),
  ...opportunities.slice(0, 15).map((x) => ({ type: x.action, target: x.page, query: x.query, priority: 40 + Math.min(25, Math.floor(x.commercialIntentScore / 4)), protectedByRevenue: protectedUrls.has(x.page), affiliateClicks: x.affiliateClicks, intentScore: x.commercialIntentScore, confirmedYen: x.confirmedYen }))
].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));

const report = {
  generatedAt: new Date().toISOString(),
  gscFetchedAt: gsc?.fetchedAt || null,
  analyticsFetchedAt: analytics?.fetchedAt || null,
  affiliateNormalizedAt: affiliate?.normalizedAt || null,
  sourceFreshness: {
    searchConsole: gscFreshness,
    analytics: analyticsFreshness
  },
  traffic: {
    totalAffiliateClicks: analyticsFreshness.fresh ? Number(analytics?.totalAffiliateClicks || 0) : 0,
    affiliateClicksByPage: analyticsFreshness.fresh ? (analytics?.rows || []).slice(0, 50) : []
  },
  revenue: affiliate?.totals || { events: 0, pendingYen: 0, confirmedYen: 0, rejectedYen: 0, unknownYen: 0 },
  commercialSignals: commercialSignals.slice(0, 50),
  opportunities,
  affiliatePaths: affiliatePaths.slice(0, 30),
  protectedPages,
  nextActions
};
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/latest.json', JSON.stringify(report, null, 2));
console.log(`Report: ${opportunities.length} search opportunities, ${report.traffic.totalAffiliateClicks} fresh outbound affiliate click(s), ${winners.length} confirmed revenue paths, ${pending.length} pending paths, ${commercialSignals.length} commercial signal page(s). GSC fresh=${gscFreshness.fresh}, GA fresh=${analyticsFreshness.fresh}.`);
