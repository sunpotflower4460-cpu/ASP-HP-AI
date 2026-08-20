import './lib/load-local-env.mjs';
import fs from 'node:fs';

const clientKey = process.env.VALUECOMMERCE_CLIENT_KEY;
const clientSecret = process.env.VALUECOMMERCE_CLIENT_SECRET;
const required = process.env.VALUECOMMERCE_FETCH_REQUIRED === 'true';

if (!clientKey || !clientSecret) {
  const message = 'ValueCommerce API credentials are not configured; skipping.';
  if (required) throw new Error(message);
  console.log(message);
  process.exit(0);
}

const lookbackDays = Math.max(1, Math.min(180, Number(process.env.VALUECOMMERCE_LOOKBACK_DAYS || 30)));
const formatJstDate = (date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date);
const toDate = formatJstDate(new Date());
const fromDate = formatJstDate(new Date(Date.now() - (lookbackDays - 1) * 86400000));

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 500) }; }
  if (!response.ok || body?.error) {
    const code = body?.error || response.headers.get('www-authenticate') || response.status;
    throw new Error(`ValueCommerce API error (${code}): ${body?.error_description || response.statusText}`);
  }
  return body;
}

function findKey(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const found = findKey(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function getRows(body) {
  const rows = body?.resultSet?.rowData ?? body?.rowData ?? findKey(body, 'rowData') ?? [];
  return Array.isArray(rows) ? rows : rows ? [rows] : [];
}

const signature = Buffer.from(`${clientKey}|${clientSecret}`, 'utf8').toString('base64');
const tokenUrl = new URL('https://api.valuecommerce.com/auth/v1/affiliate/token/');
tokenUrl.searchParams.set('grant_type', 'client_credentials');
const tokenBody = await fetchJson(tokenUrl, {
  headers: { Authorization: `Bearer ${signature}`, Accept: 'application/json' }
});
const bearerToken = findKey(tokenBody, 'bearer_token');
if (!bearerToken || typeof bearerToken !== 'string') throw new Error('ValueCommerce bearer_token was not present in the response.');

const endpoint = 'https://api.valuecommerce.com/report/v3/affiliate/transaction/';
const allRows = [];
let offset = 0;
let pages = 0;
while (true) {
  const url = new URL(endpoint);
  url.searchParams.set('limit', '1000');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('criteria', 'o');
  url.searchParams.set('from_date', fromDate);
  url.searchParams.set('to_date', toDate);
  url.searchParams.set('approval_status', 'p,a,c,i');
  url.searchParams.set('via_ad', 'true');
  url.searchParams.set('via_vpc', 'false');

  const body = await fetchJson(url, {
    headers: { Authorization: `Bearer ${bearerToken}`, Accept: 'application/json' }
  });
  const rows = getRows(body);
  for (const row of rows) {
    allRows.push({
      clickDate: row.clickDate ?? null,
      orderDate: row.orderDate ?? null,
      approvalDate: row.approvalDate ?? null,
      transactionOid: row.transactionOid ?? null,
      merchantOid: row.merchantOid ?? null,
      merchantName: row.merchantName ?? null,
      programOid: row.programOid ?? null,
      programName: row.programName ?? null,
      vcptn: row.vcptn ?? null,
      itemQuantity: row.itemQuantity ?? null,
      itemPriceTotal: Number(row.itemPriceTotal || 0),
      affilPayment: Number(row.affilPayment || 0),
      approvalStatus: row.approvalStatus ?? null,
      device: row.device ?? null,
      updDate: row.updDate ?? null
    });
  }
  pages += 1;
  const nextOffset = Number(body?.resultSet?.responseInfo?.nextOffset ?? findKey(body, 'nextOffset') ?? -1);
  if (nextOffset < 0 || rows.length === 0 || nextOffset === offset) break;
  offset = nextOffset;
  if (pages >= 100) throw new Error('ValueCommerce pagination safety limit reached.');
}

const byStatus = allRows.reduce((acc, row) => {
  const key = String(row.approvalStatus || 'UNKNOWN').toUpperCase();
  const bucket = acc[key] || { count: 0, amountYen: 0 };
  bucket.count += 1;
  bucket.amountYen += Number(row.affilPayment || 0);
  acc[key] = bucket;
  return acc;
}, {});

const output = {
  fetchedAt: new Date().toISOString(),
  period: { fromDate, toDate, lookbackDays },
  apiVersion: 3,
  rows: allRows,
  summary: { count: allRows.length, byStatus }
};
fs.mkdirSync('data/affiliate', { recursive: true });
fs.writeFileSync('data/affiliate/valuecommerce-latest.json', JSON.stringify(output, null, 2));
console.log(`Saved ${allRows.length} ValueCommerce orders (${fromDate}..${toDate}).`);
