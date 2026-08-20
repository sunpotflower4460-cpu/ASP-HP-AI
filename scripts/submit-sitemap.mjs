import fs from 'node:fs';
import { getGoogleServiceAccountToken } from './lib/google-auth.mjs';

const email = process.env.GSC_CLIENT_EMAIL;
const privateKey = process.env.GSC_PRIVATE_KEY;
const gscSiteUrl = process.env.GSC_SITE_URL;
const siteUrl = process.env.SITE_URL;
const required = process.env.GSC_SUBMIT_REQUIRED === 'true';

if (process.env.PUBLIC_READY !== 'true') {
  console.log('PUBLIC_READY is not true; sitemap submission skipped.');
  process.exit(0);
}
if (!email || !privateKey || !gscSiteUrl || !siteUrl) {
  const message = 'GSC sitemap submission is not fully configured; skipping.';
  if (required) throw new Error(message);
  console.log(message);
  process.exit(0);
}
let base;
try { base = new URL(siteUrl); } catch { throw new Error('SITE_URL must be a valid absolute URL.'); }
if (base.protocol !== 'https:' || base.hostname === 'example.com') throw new Error('SITE_URL must be the real HTTPS production URL.');
const sitemapUrl = new URL('/sitemap-index.xml', base).toString();
const accessToken = await getGoogleServiceAccountToken({
  email,
  privateKey,
  scope: 'https://www.googleapis.com/auth/webmasters'
});
const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscSiteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
const response = await fetch(endpoint, {
  method: 'PUT',
  headers: { authorization: `Bearer ${accessToken}` }
});
if (!response.ok) throw new Error(`GSC sitemap submit error: ${response.status} ${await response.text()}`);
const output = {
  submittedAt: new Date().toISOString(),
  property: gscSiteUrl,
  sitemapUrl,
  status: 'submitted'
};
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/sitemap-submit.json', `${JSON.stringify(output, null, 2)}\n`);
console.log(`Submitted sitemap to Search Console: ${sitemapUrl}`);
