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
const rowLimit = 25000;
const maxPages = Math.max(1, Math.min(20, Number(process.env.GSC_MAX_PAGES || 3)));
const allRows = [];
let responseAggregationType = null;
let pagesFetched = 0;
let complete = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(startRow) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(api, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        startDate: date(start),
        endDate: date(end),
        dimensions: ['query', 'page'],
        rowLimit,
        startRow
      })
    });

    if (response.ok) return response.json();

    const text = await response.text();
    lastError = new Error(`GSC API error ${response.status}: ${text.slice(0, 1000)}`);
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 2) throw lastError;

    const retryAfter = Number(response.headers.get('retry-after') || 0);
    const delayMs = retryAfter > 0
      ? Math.min(10000, retryAfter * 1000)
      : Math.min(4000, 500 * (2 ** attempt));
    console.warn(`GSC page startRow=${startRow} failed with ${response.status}; retrying in ${delayMs}ms.`);
    await sleep(delayMs);
  }
  throw lastError || new Error('GSC fetch failed.');
}

for (let page = 0; page < maxPages; page += 1) {
  const startRow = page * rowLimit;
  const data = await fetchPage(startRow);
  const rows = Array.isArray(data.rows) ? data.rows : [];
  pagesFetched += 1;
  if (responseAggregationType == null && data.responseAggregationType != null) {
    responseAggregationType = data.responseAggregationType;
  }
  allRows.push(...rows);

  if (rows.length < rowLimit) {
    complete = true;
    break;
  }
}

if (!complete) {
  throw new Error(`GSC pagination safety limit reached (${maxPages} page(s), ${allRows.length} row(s)) before a terminal page. Increase GSC_MAX_PAGES only after reviewing API limits. Previous latest.json was left untouched.`);
}

const output = {
  fetchedAt: new Date().toISOString(),
  siteUrl,
  period: { startDate: date(start), endDate: date(end) },
  dimensions: ['query', 'page'],
  rows: allRows,
  ...(responseAggregationType != null ? { responseAggregationType } : {}),
  pagination: {
    rowLimit,
    pagesFetched,
    totalRows: allRows.length,
    complete
  }
};

// Write only after every page succeeded. A transient failure never replaces the
// previous known-good observation with a partial dataset.
fs.mkdirSync('data/search-console', { recursive: true });
const temp = 'data/search-console/latest.json.tmp';
fs.writeFileSync(temp, `${JSON.stringify(output, null, 2)}\n`);
fs.renameSync(temp, 'data/search-console/latest.json');
console.log(`Saved ${allRows.length} Search Console rows across ${pagesFetched} page(s).`);
