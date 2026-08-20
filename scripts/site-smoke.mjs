import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const publicReady = process.env.PUBLIC_READY === 'true';
const gaMeasurementId = String(process.env.PUBLIC_GA_MEASUREMENT_ID || '').trim();
const analyticsEnabled = /^G-[A-Z0-9]+$/i.test(gaMeasurementId);
const failures = [];

if (!fs.existsSync(dist)) {
  console.error('Smoke test requires dist/. Run astro build first.');
  process.exit(1);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(dist);
const htmlFiles = files.filter((file) => file.endsWith('.html'));
if (!htmlFiles.length) failures.push('dist contains no HTML files');
if (!fs.existsSync(path.join(dist, 'index.html'))) failures.push('dist/index.html is missing');
if (!fs.existsSync(path.join(dist, 'robots.txt'))) failures.push('dist/robots.txt is missing');
if (!fs.existsSync(path.join(dist, 'health.json'))) failures.push('dist/health.json is missing');
if (!files.some((file) => /^sitemap.*\.xml$/i.test(path.basename(file)))) failures.push('sitemap XML is missing');

function resolveInternalHref(href) {
  const raw = href.split('#')[0].split('?')[0];
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  if (/\.[a-z0-9]+$/i.test(raw)) return path.join(dist, raw.replace(/^\//, ''));
  const clean = raw.replace(/^\//, '').replace(/\/$/, '');
  return clean ? path.join(dist, clean, 'index.html') : path.join(dist, 'index.html');
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const relative = path.relative(dist, file);
  if (!html.includes('アフィリエイト広告を利用しています')) failures.push(`${relative}: disclosure is missing`);
  if (!/rel=["']canonical["']/i.test(html)) failures.push(`${relative}: canonical link is missing`);
  if (!/rel=["']sitemap["']/i.test(html)) failures.push(`${relative}: sitemap discovery link is missing`);
  if (!/property=["']og:title["']/i.test(html)) failures.push(`${relative}: og:title is missing`);
  if (publicReady && html.includes('https://example.com')) failures.push(`${relative}: example.com remains in public build`);
  if (publicReady && /name=["']robots["'][^>]+noindex/i.test(html)) failures.push(`${relative}: public build still has noindex`);

  const hasGoogleTag = html.includes('googletagmanager.com/gtag/js');
  if (analyticsEnabled && !hasGoogleTag) failures.push(`${relative}: Google Analytics is configured but tag is missing`);
  if (!analyticsEnabled && hasGoogleTag) failures.push(`${relative}: Google Analytics tag exists while analytics is disabled`);
  if (analyticsEnabled && !html.includes('affiliate_click')) failures.push(`${relative}: affiliate_click analytics handler is missing`);

  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = match[1];
    const target = resolveInternalHref(href);
    if (!target) continue;
    if (!fs.existsSync(target)) failures.push(`${relative}: broken internal href ${href}`);
  }
}

if (fs.existsSync(path.join(dist, 'robots.txt'))) {
  const robots = fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8');
  if (publicReady && !/Allow:\s*\//i.test(robots)) failures.push('robots.txt does not allow crawling in public mode');
  if (!publicReady && !/Disallow:\s*\//i.test(robots)) failures.push('robots.txt does not block crawling before public launch');
  if (publicReady && robots.includes('example.com')) failures.push('robots.txt still references example.com in public mode');
  if (publicReady && !/Sitemap:\s*https:\/\//i.test(robots)) failures.push('robots.txt is missing an absolute sitemap URL in public mode');
}

if (fs.existsSync(path.join(dist, 'health.json'))) {
  try {
    const health = JSON.parse(fs.readFileSync(path.join(dist, 'health.json'), 'utf8'));
    if (health.status !== 'ok') failures.push('health.json status is not ok');
    if (Boolean(health.publicReady) !== publicReady) failures.push('health.json publicReady does not match build mode');
  } catch (error) {
    failures.push(`health.json is invalid JSON: ${error.message}`);
  }
}

const privacyPath = path.join(dist, 'privacy', 'index.html');
const externalPath = path.join(dist, 'external-transmission', 'index.html');
if (analyticsEnabled) {
  if (!fs.existsSync(privacyPath) || !fs.readFileSync(privacyPath, 'utf8').includes('Google Analytics')) failures.push('privacy page does not disclose enabled Google Analytics');
  if (!fs.existsSync(externalPath) || !fs.readFileSync(externalPath, 'utf8').includes('Google Analytics')) failures.push('external-transmission page does not disclose enabled Google Analytics');
}

if (failures.length) {
  console.error('Site smoke test failed:\n- ' + [...new Set(failures)].join('\n- '));
  process.exit(1);
}
console.log(`Site smoke test passed (${htmlFiles.length} HTML files checked, analytics=${analyticsEnabled ? 'on' : 'off'}).`);
