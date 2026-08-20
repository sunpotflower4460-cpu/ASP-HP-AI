import './lib/load-local-env.mjs';
import fs from 'node:fs';
import { getGoogleServiceAccountToken } from './lib/google-auth.mjs';

const email = process.env.GSC_CLIENT_EMAIL;
const privateKey = process.env.GSC_PRIVATE_KEY;
const siteUrl = process.env.GSC_SITE_URL;
if (!email || !privateKey || !siteUrl) {
  console.log('GSC credentials are not configured; skipping.');
  process.exit(0);
}

const accessToken = await getGoogleServiceAccountToken({
  email,
  privateKey,
  scope: 'https://www.googleapis.com/auth/webmasters.readonly'
});
const end = new Date(Date.now() - 3 * 86400000);
const start = new Date(end.getTime() - 27 * 86400000);
const date = (d) => d.toISOString().slice(0, 10);
const api = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
const response = await fetch(api, {
  method: 'POST',
  headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
  body: JSON.stringify({ startDate: date(start), endDate: date(end), dimensions: ['query','page'], rowLimit: 25000 })
});
if (!response.ok) throw new Error(`GSC API error: ${response.status} ${await response.text()}`);
const data = await response.json();
fs.mkdirSync('data/search-console', { recursive: true });
fs.writeFileSync('data/search-console/latest.json', JSON.stringify({ fetchedAt: new Date().toISOString(), siteUrl, ...data }, null, 2));
console.log(`Saved ${data.rows?.length || 0} Search Console rows.`);
