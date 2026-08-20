import fs from 'node:fs';
import path from 'node:path';

export const offerDir = path.join(process.cwd(), 'data', 'offers');
export const decisionTags = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'decision-tags.json'), 'utf8'));
export const allowedDecisionTags = new Set(decisionTags.map((tag) => tag.id));

export function jstDate() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function validHttps(value) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

export function offerPath(id) {
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(String(id || ''))) throw new Error('Offer id must be 2-64 lowercase letters/numbers/_/-.');
  return path.join(offerDir, `${id}.json`);
}

export function loadOffer(id) {
  const file = offerPath(id);
  if (!fs.existsSync(file)) throw new Error(`Offer '${id}' does not exist.`);
  return { file, offer: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

export function evaluateOffer(offer) {
  const checks = [];
  const add = (id, ok, level, message) => checks.push({ id, ok: Boolean(ok), level, message });
  const asp = String(offer.asp || '').toLowerCase();

  add('id', /^[a-z0-9][a-z0-9_-]{1,63}$/.test(String(offer.id || '')), 'required', 'Stable lowercase offer id.');
  add('name', Boolean(String(offer.name || '').trim()), 'required', 'Offer name is present.');
  add('asp', ['a8','valuecommerce'].includes(asp), 'required', 'V1 supports A8 or ValueCommerce.');
  add('status', ['draft','active','paused'].includes(String(offer.status || '')), 'required', 'Status must be draft/active/paused.');
  add('affiliate-url', validHttps(offer.affiliateUrl) && !String(offer.affiliateUrl || '').includes('example.com'), 'required', 'Affiliate URL must be a real HTTPS URL.');
  add('official-url', validHttps(offer.officialUrl) && !String(offer.officialUrl || '').includes('example.com'), 'required', 'Official URL must be a real HTTPS URL.');
  add('web-media', (offer.allowedMedia || []).includes('web'), 'required', 'Web media must be explicitly allowed for this offer.');

  const tags = offer.decisionTags || [];
  add('decision-tags-type', Array.isArray(tags), 'required', 'decisionTags must be an array.');
  add('decision-tags-known', Array.isArray(tags) && tags.every((tag) => allowedDecisionTags.has(tag)), 'required', 'All decisionTags must use the central tag registry.');
  add('decision-tags-present', Array.isArray(tags) && tags.length > 0, 'recommended', 'At least one verified decision tag helps diagnosis/filtering.');

  if (asp === 'valuecommerce') add('vc-program-id', offer.aspProgramId != null && String(offer.aspProgramId).trim() !== '', 'required', 'ValueCommerce needs aspProgramId for revenue attribution.');

  const facts = Object.entries(offer.facts || {});
  add('facts', facts.length > 0, 'required', 'At least one sourced fact is required.');
  add('summary', typeof offer.facts?.summary?.value === 'string' && offer.facts.summary.value.trim().length >= 10, 'required', 'A useful sourced summary is required.');
  for (const [key, fact] of facts) {
    add(`fact-source:${key}`, validHttps(fact?.source) && !String(fact?.source || '').includes('example.com'), 'required', `${key}: real HTTPS source.`);
    const checked = Date.parse(`${fact?.checkedAt || ''}T00:00:00Z`);
    const ttl = Number(fact?.ttlDays || 0);
    const expires = checked + ttl * 86400000;
    add(`fact-date:${key}`, Number.isFinite(checked) && ttl > 0, 'required', `${key}: checkedAt and positive ttlDays.`);
    add(`fact-fresh:${key}`, Number.isFinite(expires) && Date.now() <= expires, 'required', `${key}: fact is still inside its TTL.`);
  }

  const requiredFailures = checks.filter((check) => check.level === 'required' && !check.ok);
  return { ready: requiredFailures.length === 0, checks, requiredFailures };
}
