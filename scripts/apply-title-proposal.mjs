import fs from 'node:fs';

if (process.env.EDITOR_AUTO_APPLY_TITLE !== 'true') {
  console.log('Automatic title application disabled; skipping.');
  process.exit(0);
}
if (!fs.existsSync('reports/ai-editor-proposal.json')) {
  console.log('No AI editor proposal; skipping.');
  process.exit(0);
}
const output = JSON.parse(fs.readFileSync('reports/ai-editor-proposal.json', 'utf8'));
const policy = JSON.parse(fs.readFileSync('data/editor-policy.json', 'utf8'));
const rules = JSON.parse(fs.readFileSync('data/rules.json', 'utf8'));
let changed = 0;

for (const item of output.proposals || []) {
  if (item.kind !== 'title' || !item.autoApplyAllowed || item.protectedByRevenue) continue;
  if ((item.blockedReasons || []).length) continue;
  const title = String(item.proposal?.proposedTitle || '').trim();
  const confidence = Number(item.proposal?.confidence || 0);
  if (confidence < 0.8) continue;
  if (title.length < Number(policy.minimumTitleLength || 10) || title.length > Number(policy.maximumTitleLength || 60)) continue;
  if ((rules.prohibitedPhrases || []).some((phrase) => title.includes(phrase))) continue;
  if (!item.targetFile?.startsWith('src/pages/') || !fs.existsSync(item.targetFile)) continue;

  const source = fs.readFileSync(item.targetFile, 'utf8');
  const match = source.match(/<BaseLayout\s+title="([^"]*)"/);
  if (!match) continue;
  const escapedTitle = title.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const next = source.replace(match[0], `<BaseLayout title="${escapedTitle}"`);
  if (next !== source) {
    fs.writeFileSync(item.targetFile, next);
    changed += 1;
  }
}
console.log(`Applied ${changed} safe title proposal(s).`);
