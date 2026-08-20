import fs from 'node:fs';

const readJson = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
const gsc = readJson('data/search-console/latest.json');
const analytics = readJson('data/analytics/latest.json');
const affiliate = readJson('data/affiliate/normalized-latest.json');
const pages = readJson('data/pages.json') || [];
const site = readJson('data/site.json') || {};
const siteBase = process.env.SITE_URL || site.url || 'https://example.com';
const pageById = new Map(pages.map((page) => [page.id, page]));

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
  (analytics?.rows || []).map((row) => [normalizePath(row.pagePath), Number(row.eventCount || 0)])
);

const opportunities = (gsc?.rows || [])
  .map((row) => {
    const page = normalizeUrl(row.keys?.[1]);
    const pagePath = normalizePath(row.keys?.[1]);
    return {
      query: row.keys?.[0],
      page,
      pagePath,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      affiliateClicks: affiliateClicksByPath.get(pagePath) || 0
    };
  })
  .filter((r)=>r.impressions>=10 && r.position>=4 && r.position<=20)
  .map((r)=>({...r,action:r.impressions>=20 && r.ctr<0.03 ? 'REVIEW_TITLE' : 'REVIEW_CONTENT'}))
  .sort((a,b)=>b.impressions-a.impressions)
  .slice(0,30);

const affiliatePaths = (affiliate?.paths || []).filter((x) => x.pageId || x.offerId || x.programId).slice(0,30);
const winners = affiliatePaths.filter((x) => x.confirmedYen > 0);
const pending = affiliatePaths.filter((x) => x.confirmedYen === 0 && x.pendingYen > 0);
const protectedPageIds = new Set(winners.map((x) => x.pageId).filter(Boolean));
const protectedUrls = new Set([...protectedPageIds].map(pageIdToUrl).filter(Boolean));
const protectedPages = [...protectedPageIds].map((pageId) => ({ pageId, page: pageById.get(pageId) || null, url: pageIdToUrl(pageId) }));

const report = {
  generatedAt:new Date().toISOString(),
  gscFetchedAt:gsc?.fetchedAt || null,
  analyticsFetchedAt:analytics?.fetchedAt || null,
  affiliateNormalizedAt:affiliate?.normalizedAt || null,
  traffic: {
    totalAffiliateClicks: Number(analytics?.totalAffiliateClicks || 0),
    affiliateClicksByPage: (analytics?.rows || []).slice(0,50)
  },
  revenue: affiliate?.totals || { events:0,pendingYen:0,confirmedYen:0,rejectedYen:0,unknownYen:0 },
  opportunities,
  affiliatePaths,
  protectedPages,
  nextActions: [
    ...winners.slice(0,5).map((x) => ({type:'PROTECT_WINNER', target:pageIdToUrl(x.pageId) || x.offerId || x.programName, pageId:x.pageId || null, reason:`confirmed reward ¥${x.confirmedYen}`})),
    ...pending.slice(0,5).map((x) => ({type:'MONITOR_PENDING', target:pageIdToUrl(x.pageId) || x.offerId || x.programName, pageId:x.pageId || null, reason:`pending reward ¥${x.pendingYen}`})),
    ...opportunities.slice(0,10).map((x) => ({type:x.action, target:x.page, query:x.query, protectedByRevenue: protectedUrls.has(x.page), affiliateClicks:x.affiliateClicks}))
  ]
};
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/latest.json',JSON.stringify(report,null,2));
console.log(`Report: ${opportunities.length} search opportunities, ${Number(analytics?.totalAffiliateClicks || 0)} outbound affiliate click(s), ${winners.length} confirmed revenue paths, ${pending.length} pending paths.`);
