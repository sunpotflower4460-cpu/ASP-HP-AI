import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run a8:import -- path/to/a8-report.csv');
  process.exit(1);
}
const buffer = fs.readFileSync(input);
const encoding = (process.env.A8_CSV_ENCODING || 'shift_jis').toLowerCase();
const text = new TextDecoder(encoding).decode(buffer).replace(/^\uFEFF/, '');

function parseCsv(source) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const parsed = parseCsv(text);
if (parsed.length < 2) throw new Error('CSV has no data rows. Check A8_CSV_ENCODING.');
const headers = parsed[0].map((h) => h.trim());
const objects = parsed.slice(1).map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])));
const get = (row, candidates) => { for (const key of candidates) if (key in row && row[key] !== '') return row[key]; return ''; };
const money = (value) => Number(String(value || '').replace(/[¥￥,\s円]/g, '')) || 0;

// Persist only fields required for revenue attribution. Do not store the full
// source row because report exports may contain unnecessary/sensitive columns.
const rows = objects.map((raw, index) => ({
  row: index + 2,
  occurredAt: get(raw, ['成果発生日','発生日','注文日時','発生日時']),
  status: get(raw, ['ステータス','成果状態','確定状況']),
  amountYen: money(get(raw, ['成果報酬額','成果報酬','報酬額','発生報酬額'])),
  pageId: get(raw, ['id1','ID1']),
  offerId: get(raw, ['id2','ID2']),
  ctaId: get(raw, ['id3','ID3']),
  positionId: get(raw, ['id4','ID4']),
  extraId: get(raw, ['id5','ID5'])
}));

const grouped = new Map();
for (const row of rows) {
  const key = [row.pageId,row.offerId,row.ctaId,row.positionId].join('|');
  const current = grouped.get(key) || {pageId:row.pageId,offerId:row.offerId,ctaId:row.ctaId,positionId:row.positionId,count:0,amountYen:0};
  current.count += 1;
  current.amountYen += row.amountYen;
  grouped.set(key, current);
}
const output = {
  importedAt: new Date().toISOString(),
  sourceFile: path.basename(input),
  encoding,
  rows,
  summary: [...grouped.values()].sort((a,b) => b.amountYen - a.amountYen)
};
fs.mkdirSync('data/affiliate', { recursive: true });
fs.writeFileSync('data/affiliate/a8-latest.json', JSON.stringify(output, null, 2));
console.log(`Imported ${rows.length} A8 rows; ${output.summary.length} tracked combinations.`);
