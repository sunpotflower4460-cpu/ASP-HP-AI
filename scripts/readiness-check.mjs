import './lib/load-local-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { isSafeHttpsUrl } from './lib/url-safety.mjs';

const site = JSON.parse(fs.readFileSync('data/site.json', 'utf8'));
const offerDir = 'data/offers';
const offers = fs.readdirSync(offerDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(offerDir, f), 'utf8')));
const activeOffers = offers.filter((offer) => offer.status === 'active');
const checks = [];
const add = (id, ok, level, message) => checks.push({ id, ok, level, message });
const requireActiveOffer = process.env.REQUIRE_ACTIVE_OFFER_FOR_LAUNCH === 'true';

const siteUrl = process.env.SITE_URL || site.url || '';
const safeSiteUrl = isSafeHttpsUrl(siteUrl);
add('site-url', safeSiteUrl, 'required', safeSiteUrl ? `Site URL: ${siteUrl}` : 'SITE_URL/data/site.json must be a real HTTPS URL without credentials/placeholders/local hosts.');
add('operator', Boolean(site.operator) && !String(site.operator).includes('設定してください'), 'required', 'Operator information must be finalized before public launch.');
add('contact', Boolean(site.contact) && !String(site.contact).includes('設定してください'), 'required', 'Contact information must be finalized before public launch.');
add(
  'active-offer',
  activeOffers.length > 0,
  requireActiveOffer ? 'required' : 'informational',
  activeOffers.length
    ? `${activeOffers.length} active offer(s).`
    : requireActiveOffer
      ? 'Initial public launch requires at least one verified active affiliate offer.'
      : 'No active affiliate offer is configured. This is allowed for an already-live site so ended offers can be removed safely.'
);

for (const offer of activeOffers) {
  const urlsOk = isSafeHttpsUrl(offer.affiliateUrl) && isSafeHttpsUrl(offer.officialUrl);
  add(`offer-url:${offer.id}`, urlsOk, 'required', `${offer.id}: affiliateUrl/officialUrl must both be real safe HTTPS URLs.`);
  add(`offer-web:${offer.id}`, (offer.allowedMedia || []).includes('web'), 'required', `${offer.id}: web must be an allowed medium.`);
  add(`offer-facts:${offer.id}`, Object.keys(offer.facts || {}).length > 0, 'required', `${offer.id}: at least one sourced fact is required.`);
}

const gscConfigured = Boolean(process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY && process.env.GSC_SITE_URL);
add('gsc', gscConfigured, 'recommended', gscConfigured ? 'Search Console credentials are configured.' : 'Search Console credentials are not configured yet.');

const gaMeasurementId = String(process.env.PUBLIC_GA_MEASUREMENT_ID || '').trim();
const gaTagEnabled = /^G-[A-Z0-9]+$/i.test(gaMeasurementId);
const gaPropertyId = String(process.env.GA_PROPERTY_ID || '').trim();
const gaCredentialsConfigured = Boolean(
  (process.env.GA_CLIENT_EMAIL || process.env.GSC_CLIENT_EMAIL) &&
  (process.env.GA_PRIVATE_KEY || process.env.GSC_PRIVATE_KEY)
);
const gaApiConfigured = /^\d+$/.test(gaPropertyId) && gaCredentialsConfigured;
const gaFetchRequired = process.env.GA_FETCH_REQUIRED === 'true';
if (gaTagEnabled || gaFetchRequired || gaPropertyId) {
  add(
    'ga-data-api',
    gaApiConfigured,
    gaFetchRequired ? 'required' : 'recommended',
    gaApiConfigured
      ? `GA4 Data API is configured for property ${gaPropertyId}.`
      : 'GA4 browser tracking is enabled/configured, but GA_PROPERTY_ID and Data API credentials are incomplete; AI analysis will not receive affiliate_click data.'
  );
} else {
  add('ga-data-api', true, 'informational', 'GA4 is disabled; no Analytics Data API configuration is required.');
}

const publicReady = process.env.PUBLIC_READY === 'true';
add('public-ready', publicReady, 'informational', publicReady ? 'PUBLIC_READY=true: indexing can be enabled.' : 'PUBLIC_READY is false: noindex + robots deny remain active.');

const requiredFailures = checks.filter((check) => check.level === 'required' && !check.ok);
const output = {
  generatedAt: new Date().toISOString(),
  mode: requireActiveOffer ? 'initial-launch' : 'ongoing-deploy',
  requireActiveOffer,
  readyForPublicLaunch: requiredFailures.length === 0,
  checks
};
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/readiness.json', JSON.stringify(output, null, 2));
for (const check of checks) console.log(`${check.ok ? 'PASS' : 'WAIT'} [${check.level}] ${check.id}: ${check.message}`);
console.log(output.readyForPublicLaunch ? 'Required readiness prerequisites are satisfied.' : `${requiredFailures.length} required readiness prerequisite(s) remain.`);
if (process.env.READINESS_STRICT === 'true' && requiredFailures.length) process.exit(1);
