import fs from 'node:fs';

const OXFORD_URL = 'https://www.oxfordlearnersdictionaries.com/wordlists/oxford3000-5000';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const script = read('mousetrap_script_data.json');
const context = read('data/vocabulary-rebuild/block-3-line-vocabulary.json');
const threshold = read('data/vocabulary-rebuild/block-3-b1plus-coverage.json');
const reviewPath = 'data/vocabulary-rebuild/block-3-oxford-review.json';
const reportPath = 'data/vocabulary-rebuild/block-3-oxford-audit.json';
const review = fs.existsSync(reviewPath) ? read(reviewPath) : { includeLexemes: [], excludeWords: {} };
const speeches = script['act1-scene2'].speeches.slice(178, 336);
const strict = process.argv.includes('--strict');

function decodeHtml(s) {
  return s.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/&ndash;|&mdash;/gi,'-').replace(/&[a-z]+;/gi,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
}
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKC').replace(/[‘’]/g,"'").replace(/[^a-z'-]+/g,' ').trim().replace(/\s+/g,' ');
}
function variants(token) {
  const out = new Set([token]);
  if (token.endsWith("'s")) out.add(token.slice(0,-2));
  if (token.endsWith('ies') && token.length>4) out.add(token.slice(0,-3)+'y');
  if (token.endsWith('es') && token.length>4) { out.add(token.slice(0,-2)); out.add(token.slice(0,-1)); }
  if (token.endsWith('s') && token.length>3) out.add(token.slice(0,-1));
  if (token.endsWith('ied') && token.length>4) out.add(token.slice(0,-3)+'y');
  if (token.endsWith('ed') && token.length>4) { out.add(token.slice(0,-2)); out.add(token.slice(0,-1)); }
  if (token.endsWith('ing') && token.length>5) { out.add(token.slice(0,-3)); out.add(token.slice(0,-3)+'e'); }
  if (token.endsWith('er') && token.length>4) out.add(token.slice(0,-2));
  if (token.endsWith('est') && token.length>5) out.add(token.slice(0,-3));
  return out;
}

const response = await fetch(OXFORD_URL, { headers:{'user-agent':'Mozilla/5.0 vocabulary-audit'} });
if (!response.ok) throw new Error(`Oxford word list HTTP ${response.status}`);
const html = await response.text();
const visible = decodeHtml(html.replace(/<script\b[\s\S]*?<\/script>/gi,'\n').replace(/<style\b[\s\S]*?<\/style>/gi,'\n').replace(/<[^>]+>/g,'\n'));
const lines = visible.split(/\n+/).map(s=>s.trim()).filter(Boolean);
const posTerms = new Set(['noun','verb','adjective','adverb','preposition','conjunction','pronoun','determiner','exclamation','number','modal verb','indefinite article','auxiliary verb']);
const oxford = new Map();
for (let i=0;i<lines.length;i++) {
  const level = lines[i].toLowerCase();
  if (!/^[abc][12]$/.test(level)) continue;
  let p=i-1;
  while (p>=0 && p>=i-4 && !posTerms.has(lines[p].toLowerCase())) p--;
  if (p<1 || !posTerms.has(lines[p].toLowerCase())) continue;
  const word=norm(lines[p-1]); const pos=lines[p].toLowerCase();
  if (!word || word.includes(' ')) continue;
  const arr=oxford.get(word)||[];
  if (!arr.some(x=>x.pos===pos&&x.level===level)) arr.push({pos,level});
  oxford.set(word,arr);
}
if (oxford.size < 3000) throw new Error(`Oxford parser extracted only ${oxford.size} words`);

const selected = new Set();
for (const source of [context.lines, threshold.lines]) for (const entries of Object.values(source||{})) for (const e of entries||[]) {
  selected.add(norm(e.lemma)); selected.add(norm(e.surface));
}
const occurrences = new Map();
for (const speech of speeches) {
  const tokens=[...speech.text.toLowerCase().matchAll(/[a-z]+(?:['’][a-z]+)?/g)].map(m=>m[0].replace('’',"'"));
  for (const token of tokens) for (const v of variants(token)) {
    const arr=occurrences.get(v)||[];
    if (!arr.some(x=>x.speechId===speech.id&&x.form===token)) arr.push({speechId:speech.id,form:token});
    occurrences.set(v,arr);
  }
}
const rawMissing=[];
for (const [word, entries] of oxford.entries()) {
  const b1plus=entries.filter(x=>['b1','b2','c1'].includes(x.level));
  if (!b1plus.length) continue;
  const uses=occurrences.get(word); if (!uses?.length) continue;
  const covered=[...selected].some(x=>x===word||x.split(' ').includes(word));
  if (covered) continue;
  rawMissing.push({word,oxfordEntries:entries,b1plusEntries:b1plus,observedForms:[...new Set(uses.map(x=>x.form))].sort(),occurrences:uses.slice(0,12)});
}
rawMissing.sort((a,b)=>a.word.localeCompare(b.word));
const includedWords = new Set((review.includeLexemes||[]).flatMap(x=>[x.word,x.lemma,...(x.forms||[])]).map(norm));
const excluded = review.excludeWords || {};
const unresolved = rawMissing.filter(x=>!excluded[x.word] && !includedWords.has(x.word));
const coverageErrors=[];
for (const lex of review.includeLexemes||[]) {
  const forms=(lex.forms||[lex.word]).map(norm);
  for (const speech of speeches) {
    const text=norm(speech.text);
    for (const form of forms) if (text.split(' ').includes(form) && ![...selected].some(x=>x===norm(lex.lemma)||x===form)) coverageErrors.push({speechId:speech.id,lemma:lex.lemma,form});
  }
}
const report={source:OXFORD_URL,parsedOxfordWords:oxford.size,blockId:'block-3',speeches:speeches.length,selectedKeys:selected.size,rawMissingCount:rawMissing.length,reviewedExclusionCount:Object.keys(excluded).length,unresolvedCount:unresolved.length,includeLexemeCoverageErrorCount:coverageErrors.length,unresolved,includeLexemeCoverageErrors:coverageErrors,rawMissing};
fs.writeFileSync(reportPath, JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if (strict && (unresolved.length || coverageErrors.length)) process.exit(1);
