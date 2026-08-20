import './lib/load-local-env.mjs';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isSafeSiteBaseUrl } from './lib/url-safety.mjs';

const configured = String(process.env.REMOTE_SITE_URL || process.env.SITE_URL || '').trim();
if (!isSafeSiteBaseUrl(configured)) {
  throw new Error('REMOTE_SITE_URL/SITE_URL must be a safe HTTPS origin before remote smoke testing.');
}

const base = new URL(configured);
const expectPublic = process.env.REMOTE_EXPECT_PUBLIC !== 'false';
const timeoutMs = Math.max(1000, Math.min(60000, Number(process.env.REMOTE_SMOKE_TIMEOUT_MS || 10000)));
const requireCommitMatch = process.env.REMOTE_REQUIRE_COMMIT_MATCH === 'true';
const productionBranch = String(process.env.PRODUCTION_BRANCH || 'main').trim();
const localPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const failures = [];
const observations = [];

if (!/^[A-Za-z0-9._/-]+$/.test(productionBranch) || productionBranch.startsWith('/') || productionBranch.endsWith('/')) {
  throw new Error('PRODUCTION_BRANCH contains unsupported characters.');
}

function localHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout || '').trim() : null;
}

async function get(pathname, { json = false } = {}) {
  const url = new URL(pathname, base);
  const started = Date.now();
  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'ASP-HP-AI-remote-smoke/1.0' }
    });
  } catch (error) {
    failures.push(`${pathname}: request failed (${error.message})`);
    return null;
  }

  const body = await response.text();
  observations.push({
    path: pathname,
    status: response.status,
    elapsedMs: Date.now() - started,
    finalUrl: response.url
  });

  try {
    if (new URL(response.url).origin !== base.origin) {
      failures.push(`${pathname}: redirect escaped expected origin (${response.url})`);
    }
  } catch {
    failures.push(`${pathname}: invalid final response URL (${response.url})`);
  }

  if (!response.ok) {
    failures.push(`${pathname}: HTTP ${response.status}`);
    return null;
  }
  if (!json) return body;
  try { return JSON.parse(body); }
  catch {
    failures.push(`${pathname}: invalid JSON`);
    return null;
  }
}

const [health, robots, sitemap, home, comparison, privacy, externalTransmission] = await Promise.all([
  get('/health.json', { json: true }),
  get('/robots.txt'),
  get('/sitemap-index.xml'),
  get('/'),
  get('/comparison/'),
  get('/privacy/'),
  get('/external-transmission/')
]);

if (health) {
  if (health.status !== 'ok') failures.push('/health.json: status is not ok');
  if (Boolean(health.publicReady) !== expectPublic) {
    failures.push(`/health.json: publicReady=${health.publicReady} but REMOTE_EXPECT_PUBLIC=${expectPublic}`);
  }
  if (health.siteOrigin && health.siteOrigin !== base.origin) {
    failures.push(`/health.json: siteOrigin=${health.siteOrigin} but expected ${base.origin}`);
  }
  if (expectPublic && health.branch && health.branch !== productionBranch) {
    failures.push(`/health.json: public deployment reports branch '${health.branch}', expected '${productionBranch}'`);
  }
  if (requireCommitMatch) {
    const head = localHead();
    if (!head) failures.push('Cannot resolve local git HEAD for commit-match check');
    else if (!health.commitSha) failures.push('/health.json: Cloudflare commitSha is missing');
    else if (health.commitSha !== head) failures.push(`Remote commit ${health.commitSha} does not match local HEAD ${head}`);
    if (!health.version) failures.push('/health.json: application version is missing');
    else if (health.version !== localPackage.version) failures.push(`Remote version ${health.version} does not match local package version ${localPackage.version}`);
  }
}

if (robots) {
  if (expectPublic) {
    if (!/Allow:\s*\//i.test(robots)) failures.push('/robots.txt: public mode does not Allow /');
    if (/Disallow:\s*\/\s*(?:\n|$)/i.test(robots)) failures.push('/robots.txt: public mode still blocks /');
    if (!/Sitemap:\s*https:\/\//i.test(robots)) failures.push('/robots.txt: absolute sitemap URL missing');
  } else if (!/Disallow:\s*\//i.test(robots)) {
    failures.push('/robots.txt: preview/private mode does not block crawling');
  }
}

if (sitemap && !/<sitemapindex|<urlset/i.test(sitemap)) failures.push('/sitemap-index.xml: unexpected XML content');

if (home) {
  if (!home.includes('アフィリエイト広告を利用しています')) failures.push('/: affiliate disclosure missing');
  if (expectPublic && /name=["']robots["'][^>]+noindex/i.test(home)) failures.push('/: public page still contains noindex');
  if (!expectPublic && !/name=["']robots["'][^>]+noindex/i.test(home)) failures.push('/: preview/private page is missing noindex');
  if (expectPublic && /https:\/\/(?:www\.)?example\.(?:com|org|net)/i.test(home)) failures.push('/: placeholder domain remains');

  const canonical = home.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    || home.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1];
  if (!canonical) failures.push('/: canonical link missing');
  else {
    try {
      if (new URL(canonical).origin !== base.origin) failures.push(`/: canonical origin mismatch (${canonical})`);
    } catch {
      failures.push(`/: canonical URL is invalid (${canonical})`);
    }
  }
}

if (comparison && !/ネット環境|比較/.test(comparison)) failures.push('/comparison/: expected comparison content missing');
if (privacy && !/プライバシー/.test(privacy)) failures.push('/privacy/: privacy content missing');
if (externalTransmission && !/外部送信/.test(externalTransmission)) failures.push('/external-transmission/: external-transmission content missing');

const head = requireCommitMatch ? localHead() : null;
const report = {
  generatedAt: new Date().toISOString(),
  site: base.origin,
  expectPublic,
  productionBranch,
  localVersion: localPackage.version,
  remoteVersion: health?.version || null,
  requireCommitMatch,
  localHead: head,
  remoteCommitSha: health?.commitSha || null,
  remoteBranch: health?.branch || null,
  observations,
  failures,
  ok: failures.length === 0
};

fs.mkdirSync('reports', { recursive: true, mode: 0o700 });
fs.writeFileSync('reports/remote-smoke.json', `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

if (failures.length) {
  console.error(`Remote smoke test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Remote smoke test passed (${observations.length} endpoint(s), public=${expectPublic}, branch=${productionBranch}, version=${health?.version || 'unknown'}).`);
