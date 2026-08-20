import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const rules = JSON.parse(fs.readFileSync(path.join(root, 'data/rules.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(root, 'data/pages.json'), 'utf8'));
const decisionTags = JSON.parse(fs.readFileSync(path.join(root, 'data/decision-tags.json'), 'utf8'));
const offerDir = path.join(root, 'data/offers');
const failures = [];
const warnings = [];
const validUrl = (value) => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
const allowedDecisionTags = new Set(decisionTags.map((tag) => tag.id));

const seenTagIds = new Set();
for (const tag of decisionTags) {
  if (!tag.id || !tag.label) failures.push('data/decision-tags.json: id/label are required');
  if (seenTagIds.has(tag.id)) failures.push(`data/decision-tags.json: duplicate id '${tag.id}'`);
  seenTagIds.add(tag.id);
}

const seenPageIds = new Set();
const seenPagePaths = new Set();
for (const page of pages) {
  if (!page.id || !page.path || !page.name) failures.push('data/pages.json: id/path/name are required');
  if (seenPageIds.has(page.id)) failures.push(`data/pages.json: duplicate page id '${page.id}'`);
  if (seenPagePaths.has(page.path)) failures.push(`data/pages.json: duplicate page path '${page.path}'`);
  seenPageIds.add(page.id); seenPagePaths.add(page.path);
  const relative = page.path === '/' ? 'index' : page.path.replace(/^\//, '').replace(/\/$/, '');
  const target = path.join(root, 'src/pages', `${relative}.astro`);
  if (!fs.existsSync(target)) failures.push(`data/pages.json: ${page.id} points to missing ${path.relative(root,target)}`);
}

const requiredTrustPages = ['about.astro','disclosure.astro','privacy.astro','external-transmission.astro','contact.astro'];
for (const name of requiredTrustPages) {
  const file = path.join(root, 'src/pages', name);
  if (!fs.existsSync(file)) failures.push(`required trust page missing: src/pages/${name}`);
}

const seenOfferIds = new Set();
for (const file of fs.readdirSync(offerDir).filter((f) => f.endsWith('.json'))) {
  const offer = JSON.parse(fs.readFileSync(path.join(offerDir, file), 'utf8'));
  if (!offer.id || !offer.name || !offer.asp || !offer.status) failures.push(`${file}: required offer fields missing`);
  if (seenOfferIds.has(offer.id)) failures.push(`${file}: duplicate offer id '${offer.id}'`);
  seenOfferIds.add(offer.id);
  if (!Array.isArray(offer.decisionTags || [])) failures.push(`${file}: decisionTags must be an array`);
  for (const tag of offer.decisionTags || []) if (!allowedDecisionTags.has(tag)) failures.push(`${file}: unknown decisionTag '${tag}'`);
  if (offer.status === 'active') {
    if (!offer.affiliateUrl) failures.push(`${file}: active offer requires affiliateUrl`);
    if (!offer.officialUrl) failures.push(`${file}: active offer requires officialUrl`);
    if (offer.affiliateUrl && !validUrl(offer.affiliateUrl)) failures.push(`${file}: affiliateUrl must use HTTPS`);
    if (offer.officialUrl && !validUrl(offer.officialUrl)) failures.push(`${file}: officialUrl must use HTTPS`);
    if (!(offer.allowedMedia || []).includes('web')) failures.push(`${file}: active offer must explicitly allow web`);
    if (String(offer.asp).toLowerCase() === 'valuecommerce' && (offer.aspProgramId == null || String(offer.aspProgramId).trim() === '')) failures.push(`${file}: active ValueCommerce offer requires aspProgramId`);
  }
  for (const [key, fact] of Object.entries(offer.facts || {})) {
    if (!fact.source || !fact.checkedAt || !fact.ttlDays) failures.push(`${file}: fact ${key} lacks source/checkedAt/ttlDays`);
    if (fact.source && !validUrl(fact.source)) failures.push(`${file}: fact ${key} source must use HTTPS`);
  }
  if (!['a8','valuecommerce'].includes(String(offer.asp).toLowerCase())) warnings.push(`${file}: ASP '${offer.asp}' has no built-in adapter yet`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
const titles = new Map();
for (const file of walk(path.join(root, 'src/pages')).filter((f) => /\.(astro|md|mdx)$/.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const phrase of rules.prohibitedPhrases) if (text.includes(phrase)) failures.push(`${path.relative(root,file)}: prohibited phrase '${phrase}'`);

  const title = text.match(/<BaseLayout\s+title="([^"]+)"/)?.[1]?.trim();
  if (title) {
    const prior = titles.get(title);
    if (prior) failures.push(`duplicate static page title '${title}': ${prior} and ${path.relative(root,file)}`);
    else titles.set(title, path.relative(root,file));
  }
  if (file.includes(`${path.sep}guide${path.sep}`) && !/description="[^"]+"/.test(text)) {
    warnings.push(`${path.relative(root,file)}: guide page uses default description; a page-specific description is recommended`);
  }
}

for (const warning of warnings) console.warn(`WARN ${warning}`);
if (failures.length) {
  console.error('Validation failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`Content validation passed (${titles.size} static page titles checked, ${allowedDecisionTags.size} decision tags registered).`);
