import fs from 'node:fs';
import { getGoogleServiceAccountToken } from './lib/google-auth.mjs';

const propertyId = String(process.env.GA_PROPERTY_ID || '').trim();
const email = process.env.GA_CLIENT_EMAIL || process.env.GSC_CLIENT_EMAIL;
const privateKey = process.env.GA_PRIVATE_KEY || process.env.GSC_PRIVATE_KEY;
const required = process.env.GA_FETCH_REQUIRED === 'true';

if (!propertyId || !email || !privateKey) {
  const message = 'GA4 Data API is not fully configured; skipping affiliate_click fetch.';
  if (required) throw new Error(message);
  console.log(message);
  process.exit(0);
}
if (!/^\d+$/.test(propertyId)) throw new Error('GA_PROPERTY_ID must be the numeric GA4 property ID.');

const accessToken = await getGoogleServiceAccountToken({
  email,
  privateKey,
  scope: 'https://www.googleapis.com/auth/analytics.readonly'
});

const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        stringFilter: { matchType: 'EXACT', value: 'affiliate_click', caseSensitive: true }
      }
    },
    limit: '10000'
  })
});

const text = await response.text();
let body;
try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 1000) }; }
if (!response.ok) throw new Error(`GA4 Data API error ${response.status}: ${body?.error?.message || response.statusText}`);

const rows = (body.rows || []).map((row) => ({
  pagePath: row.dimensionValues?.[0]?.value || '/',
  eventCount: Number(row.metricValues?.[0]?.value || 0)
})).filter((row) => row.eventCount > 0)
  .sort((a, b) => b.eventCount - a.eventCount);
const totalAffiliateClicks = rows.reduce((sum, row) => sum + row.eventCount, 0);

const output = {
  fetchedAt: new Date().toISOString(),
  propertyId,
  period: { startDate: '28daysAgo', endDate: 'yesterday' },
  eventName: 'affiliate_click',
  totalAffiliateClicks,
  rows
};
fs.mkdirSync('data/analytics', { recursive: true });
fs.writeFileSync('data/analytics/latest.json', `${JSON.stringify(output, null, 2)}\n`);
console.log(`Saved GA4 affiliate_click report: ${totalAffiliateClicks} click(s) across ${rows.length} page(s).`);
