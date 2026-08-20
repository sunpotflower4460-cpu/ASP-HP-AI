import fs from 'node:fs';

const gscPath = 'data/search-console/latest.json';
const a8Path = 'data/affiliate/a8-latest.json';
const gsc = fs.existsSync(gscPath) ? JSON.parse(fs.readFileSync(gscPath,'utf8')) : null;
const a8 = fs.existsSync(a8Path) ? JSON.parse(fs.readFileSync(a8Path,'utf8')) : null;

const opportunities = (gsc?.rows || [])
  .map((row) => ({query:row.keys?.[0],page:row.keys?.[1],clicks:row.clicks,impressions:row.impressions,ctr:row.ctr,position:row.position}))
  .filter((r)=>r.impressions>=10 && r.position>=4 && r.position<=20)
  .map((r)=>({...r,action:r.impressions>=20 && r.ctr<0.03 ? 'REVIEW_TITLE' : 'REVIEW_CONTENT'}))
  .sort((a,b)=>b.impressions-a.impressions)
  .slice(0,30);

const affiliateWinners = (a8?.summary || []).filter((x) => x.pageId || x.offerId).slice(0,20);
const report = {
  generatedAt:new Date().toISOString(),
  gscFetchedAt:gsc?.fetchedAt || null,
  a8ImportedAt:a8?.importedAt || null,
  opportunities,
  affiliateWinners,
  nextActions: [
    ...affiliateWinners.slice(0,3).map((x) => ({type:'PROTECT_WINNER', target:x.pageId, reason:`tracked reward ¥${x.amountYen}`})),
    ...opportunities.slice(0,10).map((x) => ({type:x.action, target:x.page, query:x.query}))
  ]
};
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/latest.json',JSON.stringify(report,null,2));
console.log(`Report: ${opportunities.length} search opportunities, ${affiliateWinners.length} affiliate paths.`);
