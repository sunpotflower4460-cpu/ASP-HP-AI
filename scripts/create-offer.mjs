import fs from 'node:fs';
import { allowedDecisionTags, jstDate, offerPath, validHttps } from './lib/offer-tools.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inline] = arg.slice(2).split('=', 2);
    const value = inline ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true');
    out[rawKey] = value;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const required = ['id','name','asp','affiliate-url','official-url','summary'];
const missing = required.filter((key) => !args[key]);
if (missing.length) {
  console.error(`Missing required arguments: ${missing.join(', ')}`);
  console.error('Example: npm run offer:new -- --id my-offer --name "サービス名" --asp a8 --affiliate-url "https://..." --official-url "https://..." --summary "公式情報で確認した説明" --tags "fiber,work"');
  process.exit(1);
}

const id = String(args.id);
const asp = String(args.asp).toLowerCase();
const affiliateUrl = String(args['affiliate-url']);
const officialUrl = String(args['official-url']);
const source = String(args.source || officialUrl);
if (!['a8','valuecommerce'].includes(asp)) throw new Error('V1 offer:new supports --asp a8 or valuecommerce.');
for (const [label, value] of [['affiliate-url', affiliateUrl], ['official-url', officialUrl], ['source', source]]) {
  if (!validHttps(value) || value.includes('example.com')) throw new Error(`${label} must be a real HTTPS URL.`);
}
if (asp === 'valuecommerce' && !args['program-id']) throw new Error('ValueCommerce requires --program-id for revenue attribution.');

const tags = String(args.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
for (const tag of tags) if (!allowedDecisionTags.has(tag)) throw new Error(`Unknown decision tag '${tag}'. See data/decision-tags.json.`);
const ttlDays = Number(args.ttl || 30);
if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 365) throw new Error('--ttl must be an integer between 1 and 365.');
const reward = args.reward == null ? null : Number(args.reward);
if (reward != null && (!Number.isFinite(reward) || reward < 0)) throw new Error('--reward must be a non-negative number.');
const summary = String(args.summary).replace(/\s+/g, ' ').trim();
if (summary.length < 10) throw new Error('--summary must be at least 10 characters and based on the supplied source.');

const file = offerPath(id);
if (fs.existsSync(file)) throw new Error(`Offer '${id}' already exists. Refusing to overwrite.`);
const checkedAt = jstDate();
const offer = {
  id,
  name: String(args.name).trim(),
  asp,
  aspProgramId: args['program-id'] ?? null,
  status: 'draft',
  affiliateUrl,
  officialUrl,
  rewardYen: reward,
  allowedMedia: ['web'],
  decisionTags: tags,
  facts: {
    summary: {
      value: summary,
      source,
      checkedAt,
      ttlDays
    }
  },
  createdAt: new Date().toISOString()
};
fs.mkdirSync('data/offers', { recursive: true });
fs.writeFileSync(file, `${JSON.stringify(offer, null, 2)}\n`);
console.log(`Created ${file} as DRAFT.`);
console.log(`Next: npm run offer:check -- ${id}`);
console.log('Do not activate until ASP/media rules and the facts above have been manually verified.');
