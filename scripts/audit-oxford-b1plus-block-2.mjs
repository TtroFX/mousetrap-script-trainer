import fs from 'node:fs';

const OXFORD_URL = 'https://www.oxfordlearnersdictionaries.com/wordlists/oxford3000-5000';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const script = read('mousetrap_script_data.json');
const context = read('data/vocabulary-rebuild/block-2-line-vocabulary.json');
const threshold = read('data/vocabulary-rebuild/block-2-b1plus-coverage.json');
const speeches = script['act1-scene2'].speeches.slice(0, 178);

function decodeHtml(s) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, '-')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKC').replace(/[‘’]/g, "'").replace(/[^a-z'-]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function variants(token) {
  const out = new Set([token]);
  if (token.endsWith("'s")) out.add(token.slice(0, -2));
  if (token.endsWith('ies') && token.length > 4) out.add(token.slice(0, -3) + 'y');
  if (token.endsWith('es') && token.length > 4) { out.add(token.slice(0, -2)); out.add(token.slice(0, -1)); }
  if (token.endsWith('s') && token.length > 3) out.add(token.slice(0, -1));
  if (token.endsWith('ied') && token.length > 4) out.add(token.slice(0, -3) + 'y');
  if (token.endsWith('ed') && token.length > 4) { out.add(token.slice(0, -2)); out.add(token.slice(0, -1)); }
  if (token.endsWith('ing') && token.length > 5) { out.add(token.slice(0, -3)); out.add(token.slice(0, -3) + 'e'); }
  if (token.endsWith('er') && token.length > 4) out.add(token.slice(0, -2));
  if (token.endsWith('est') && token.length > 5) out.add(token.slice(0, -3));
  return out;
}

const response = await fetch(OXFORD_URL, { headers: { 'user-agent': 'Mozilla/5.0 vocabulary-audit' } });
if (!response.ok) throw new Error(`Oxford word list HTTP ${response.status}`);
const html = await response.text();
const visible = decodeHtml(html
  .replace(/<script\b[\s\S]*?<\/script>/gi, '\n')
  .replace(/<style\b[\s\S]*?<\/style>/gi, '\n')
  .replace(/<[^>]+>/g, '\n'));
const lines = visible.split(/\n+/).map(s => s.trim()).filter(Boolean);

const posTerms = new Set(['noun','verb','adjective','adverb','preposition','conjunction','pronoun','determiner','exclamation','number','modal verb','indefinite article','auxiliary verb']);
const cefr = new Map();
for (let i = 0; i < lines.length; i++) {
  const level = lines[i].toLowerCase();
  if (!/^[abc][12]$/.test(level)) continue;
  let posIndex = i - 1;
  while (posIndex >= 0 && posIndex >= i - 4 && !posTerms.has(lines[posIndex].toLowerCase())) posIndex--;
  if (posIndex < 1 || !posTerms.has(lines[posIndex].toLowerCase())) continue;
  const word = norm(lines[posIndex - 1]);
  if (!word || word.includes(' ')) continue;
  const previous = cefr.get(word);
  const rank = {a1:1,a2:2,b1:3,b2:4,c1:5};
  if (!previous || rank[level] > rank[previous]) cefr.set(word, level);
}
if (cefr.size < 3000) throw new Error(`Oxford parser extracted only ${cefr.size} words; refusing unreliable audit.`);

const selected = new Set();
for (const source of [context.lines, threshold.lines]) {
  for (const entries of Object.values(source || {})) for (const e of entries || []) {
    selected.add(norm(e.lemma));
    selected.add(norm(e.surface));
  }
}
const text = speeches.map(s => s.text).join(' ');
const rawTokens = [...text.toLowerCase().matchAll(/[a-z]+(?:['’][a-z]+)?/g)].map(m => m[0].replace('’', "'"));
const tokensByLemma = new Map();
for (const token of rawTokens) {
  for (const v of variants(token)) {
    if (!tokensByLemma.has(v)) tokensByLemma.set(v, new Set());
    tokensByLemma.get(v).add(token);
  }
}

const missing = [];
for (const [word, level] of cefr.entries()) {
  if (!['b1','b2','c1'].includes(level)) continue;
  const forms = tokensByLemma.get(word);
  if (!forms) continue;
  const covered = [...selected].some(x => x === word || x.split(' ').includes(word));
  if (!covered) missing.push({ word, level, observedForms: [...forms].sort() });
}
missing.sort((a,b) => a.word.localeCompare(b.word));

console.log(JSON.stringify({
  source: OXFORD_URL,
  parsedOxfordWords: cefr.size,
  blockId: 'block-2',
  speeches: speeches.length,
  selectedKeys: selected.size,
  missingCount: missing.length,
  missing
}, null, 2));
