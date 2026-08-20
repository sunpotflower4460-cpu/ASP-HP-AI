import fs from 'node:fs';

const enabled = process.env.AI_EDITOR_ENABLED === 'true';
if (!enabled) {
  console.log('AI editor disabled; skipping proposal generation.');
  process.exit(0);
}
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const model = process.env.CLOUDFLARE_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
const allowPaid = process.env.ALLOW_PAID_AI === 'true';
if (!model.startsWith('@cf/') && !allowPaid) throw new Error('Paid/third-party AI model blocked. Set ALLOW_PAID_AI=true explicitly to override.');
if (!accountId || !apiToken) throw new Error('Cloudflare AI credentials are required when AI_EDITOR_ENABLED=true.');

const plan = JSON.parse(fs.readFileSync('reports/editor-plan.json', 'utf8'));
const policy = JSON.parse(fs.readFileSync('data/editor-policy.json', 'utf8'));
const rules = JSON.parse(fs.readFileSync('data/rules.json', 'utf8'));
const maxCalls = Math.max(0, Math.min(3, Number(policy.maxAiCallsPerRun || 1)));
const proposals = [];

function parseJsonResponse(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI response did not contain JSON.');
  return JSON.parse(text.slice(start, end + 1));
}

for (const candidate of (plan.candidates || []).slice(0, maxCalls)) {
  const source = fs.readFileSync(candidate.targetFile, 'utf8').slice(0, 10000);
  const prompt = candidate.kind === 'title'
    ? `You are an SEO editor for a Japanese affiliate information site. Propose ONLY a page title improvement based on real Search Console evidence. Do not invent facts, rankings, experiences or guarantees. Query: ${candidate.query}\nEvidence: ${JSON.stringify(candidate.evidence)}\nCurrent source:\n${source}\nReturn JSON only: {"proposedTitle":"...","rationale":"...","confidence":0.0}`
    : `You are an SEO editor for a Japanese affiliate information site. Suggest one useful content section or FAQ to better answer the observed query. Do not invent prices, rankings, experiences or claims not present in the source. Query: ${candidate.query}\nEvidence: ${JSON.stringify(candidate.evidence)}\nCurrent source:\n${source}\nReturn JSON only: {"suggestedSection":"...","rationale":"...","confidence":0.0}`;

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt })
  });
  const body = await response.json();
  if (!response.ok || body?.success === false) throw new Error(`Cloudflare AI error ${response.status}: ${JSON.stringify(body?.errors || []).slice(0,500)}`);
  const text = body?.result?.response || body?.result?.text || '';
  const proposal = parseJsonResponse(String(text));
  const prohibited = (rules.prohibitedPhrases || []).filter((phrase) => JSON.stringify(proposal).includes(phrase));
  proposals.push({ ...candidate, proposal, blockedReasons: prohibited.map((x) => `prohibited phrase: ${x}`), generatedAt: new Date().toISOString(), model });
}

const output = { generatedAt: new Date().toISOString(), model, proposals };
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/ai-editor-proposal.json', JSON.stringify(output, null, 2));
console.log(`AI editor generated ${proposals.length} proposal(s) with ${model}.`);
