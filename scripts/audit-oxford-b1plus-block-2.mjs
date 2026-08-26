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
const oxford = new Map();
for (let i = 0; i < lines.length; i++) {
  const level = lines[i].toLowerCase();
  if (!/^[abc][12]$/.test(level)) continue;
  let posIndex = i - 1;
  while (posIndex >= 0 && posIndex >= i - 4 && !posTerms.has(lines[posIndex].toLowerCase())) posIndex--;
  if (posIndex < 1 || !posTerms.has(lines[posIndex].toLowerCase())) continue;
  const word = norm(lines[posIndex - 1]);
  const pos = lines[posIndex].toLowerCase();
  if (!word || word.includes(' ')) continue;
  const entries = oxford.get(word) || [];
  if (!entries.some(x => x.pos === pos && x.level === level)) entries.push({ pos, level });
  oxford.set(word, entries);
}
if (oxford.size < 3000) throw new Error(`Oxford parser extracted only ${oxford.size} words; refusing unreliable audit.`);

const selected = new Set();
for (const source of [context.lines, threshold.lines]) {
  for (const entries of Object.values(source || {})) for (const e of entries || []) {
    selected.add(norm(e.lemma));
    selected.add(norm(e.surface));
  }
}

const occurrences = new Map();
for (const speech of speeches) {
  const tokens = [...speech.text.toLowerCase().matchAll(/[a-z]+(?:['’][a-z]+)?/g)].map(m => m[0].replace('’', "'"));
  for (const token of tokens) {
    for (const v of variants(token)) {
      const list = occurrences.get(v) || [];
      if (!list.some(x => x.speechId === speech.id && x.form === token)) list.push({ speechId: speech.id, form: token, text: speech.text });
      occurrences.set(v, list);
    }
  }
}

const missing = [];
for (const [word, oxfordEntries] of oxford.entries()) {
  const b1plusEntries = oxfordEntries.filter(x => ['b1','b2','c1'].includes(x.level));
  if (!b1plusEntries.length) continue;
  const uses = occurrences.get(word);
  if (!uses?.length) continue;
  const covered = [...selected].some(x => x === word || x.split(' ').includes(word));
  if (covered) continue;
  missing.push({
    word,
    oxfordEntries,
    b1plusEntries,
    observedForms: [...new Set(uses.map(x => x.form))].sort(),
    occurrences: uses.slice(0, 5)
  });
}
missing.sort((a,b) => a.word.localeCompare(b.word));

console.log(JSON.stringify({
  source: OXFORD_URL,
  parsedOxfordWords: oxford.size,
  blockId: 'block-2',
  speeches: speeches.length,
  selectedKeys: selected.size,
  missingCount: missing.length,
  missing
}, null, 2));
