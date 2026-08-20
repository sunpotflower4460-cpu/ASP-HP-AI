import fs from 'node:fs';
const source = 'data/search-console/latest.json';
if (!fs.existsSync(source)) { console.log('No Search Console snapshot yet.'); process.exit(0); }
const data = JSON.parse(fs.readFileSync(source,'utf8'));
const opportunities = (data.rows || []).map((row) => ({query:row.keys?.[0],page:row.keys?.[1],clicks:row.clicks,impressions:row.impressions,ctr:row.ctr,position:row.position})).filter((r)=>r.impressions>=10 && r.position>=4 && r.position<=20).map((r)=>({...r,action:r.impressions>=20 && r.ctr<0.03 ? 'REVIEW_TITLE' : 'REVIEW_CONTENT'})).sort((a,b)=>b.impressions-a.impressions).slice(0,30);
const report = {generatedAt:new Date().toISOString(),sourceFetchedAt:data.fetchedAt,opportunities};
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/latest.json',JSON.stringify(report,null,2));
console.log(`Generated ${opportunities.length} opportunities.`);
