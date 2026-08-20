import fs from 'node:fs';
import crypto from 'node:crypto';

const email = process.env.GSC_CLIENT_EMAIL;
const privateKey = process.env.GSC_PRIVATE_KEY?.replace(/\\n/g, '\n');
const siteUrl = process.env.GSC_SITE_URL;
if (!email || !privateKey || !siteUrl) {
  console.log('GSC credentials are not configured; skipping.');
  process.exit(0);
}
const b64 = (input) => Buffer.from(typeof input === 'string' ? input : JSON.stringify(input)).toString('base64url');
const now = Math.floor(Date.now()/1000);
const unsigned = `${b64({alg:'RS256',typ:'JWT'})}.${b64({iss:email,scope:'https://www.googleapis.com/auth/webmasters.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})}`;
const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url');
const assertion = `${unsigned}.${signature}`;
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
if (!tokenRes.ok) throw new Error(`GSC token error: ${tokenRes.status} ${await tokenRes.text()}`);
const { access_token } = await tokenRes.json();
const end = new Date(Date.now() - 3*86400000);
const start = new Date(end.getTime() - 27*86400000);
const date = (d) => d.toISOString().slice(0,10);
const api = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
const res = await fetch(api,{method:'POST',headers:{authorization:`Bearer ${access_token}`,'content-type':'application/json'},body:JSON.stringify({startDate:date(start),endDate:date(end),dimensions:['query','page'],rowLimit:25000})});
if (!res.ok) throw new Error(`GSC API error: ${res.status} ${await res.text()}`);
const data = await res.json();
fs.mkdirSync('data/search-console',{recursive:true});
fs.writeFileSync('data/search-console/latest.json', JSON.stringify({fetchedAt:new Date().toISOString(),siteUrl,...data},null,2));
console.log(`Saved ${data.rows?.length || 0} Search Console rows.`);
