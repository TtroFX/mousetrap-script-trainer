import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');

const script = read('mousetrap_script_data.json');
const review = read('data/vocabulary-rebuild/block-3-oxford-review.json');
const context = read('data/vocabulary-rebuild/block-3-line-vocabulary.json');
const threshold = read('data/vocabulary-rebuild/block-3-b1plus-coverage.json');
const dictionary = read('data/vocabulary-rebuild/block-3-dictionary.json');

if (review.blockId !== 'block-3') throw new Error(`Unexpected review block: ${review.blockId}`);
if (threshold.blockId !== 'block-3' || dictionary.blockId !== 'block-3' || context.blockId !== 'block-3') {
  throw new Error('Block 3 generated inputs are inconsistent.');
}

const sceneId = 'act1-scene2';
const first = 179;
const last = 336;
const speeches = script[sceneId].speeches.slice(first - 1, last);
const byId = new Map(speeches.map(s => [s.id, s]));
const norm = s => String(s || '').toLowerCase().normalize('NFKC').replace(/[‘’]/g, "'").trim();
const tokenMatches = text => [...String(text || '').matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)].map(m => ({ surface:m[0], norm:norm(m[0]) }));
const pairKey = (speechId, surface, lemma) => `${speechId}|${norm(surface)}|${norm(lemma)}`;
const pairs = new Set();
for (const source of [context.lines || {}, threshold.lines || {}]) {
  for (const [speechId, entries] of Object.entries(source)) {
    for (const e of entries || []) pairs.add(pairKey(speechId, e.surface, e.lemma));
  }
}

const application = [];
const failures = [];
for (const lex of review.includeLexemes || []) {
  const lemma = String(lex.lemma || lex.word || '').trim();
  const forms = [...new Set((lex.forms || [lex.word]).map(norm).filter(Boolean))];
  if (!lemma || !forms.length || !String(lex.meaning || '').trim()) {
    failures.push({ word:lex.word, reason:'Invalid review lexeme: lemma/forms/meaning required.' });
    continue;
  }
  const requestedIds = Array.isArray(lex.speechIds) && lex.speechIds.length ? lex.speechIds : speeches.map(s => s.id);
  const matchedIds = [];
  let added = 0;
  for (const speechId of requestedIds) {
    const speech = byId.get(speechId);
    if (!speech) {
      failures.push({ word:lex.word, speechId, reason:'speechId is outside Block 3.' });
      continue;
    }
    const hits = tokenMatches(speech.text).filter(t => forms.includes(t.norm));
    if (!hits.length) {
      if (Array.isArray(lex.speechIds) && lex.speechIds.length) failures.push({ word:lex.word, speechId, reason:'Reviewed form not found in specified speech.' });
      continue;
    }
    matchedIds.push(speechId);
    const surface = hits[0].surface;
    const key = pairKey(speechId, surface, lemma);
    if (!pairs.has(key)) {
      (threshold.lines[speechId] ||= []).push({ surface, lemma, contextMeaning:'' });
      pairs.add(key);
      added++;
    }
  }
  if (!matchedIds.length) failures.push({ word:lex.word, reason:'No Block 3 occurrence matched reviewed forms.' });
  if (!dictionary.entries[lemma]) {
    dictionary.entries[lemma] = {
      pos: String(lex.pos || '未分類'),
      meaning: String(lex.meaning).trim(),
      ...(lex.cefr ? { cefr:lex.cefr } : {})
    };
  }
  application.push({ word:lex.word, lemma, cefr:lex.cefr || null, matchedSpeechCount:matchedIds.length, addedEntryCount:added, matchedSpeechIds:matchedIds });
}

if (failures.length) {
  console.error(JSON.stringify({ failures }, null, 2));
  process.exit(1);
}

for (const entries of Object.values(threshold.lines || {})) {
  entries.sort((a,b) => String(a.surface).localeCompare(String(b.surface), 'en'));
}

write('data/vocabulary-rebuild/block-3-b1plus-coverage.json', threshold);
write('data/vocabulary-rebuild/block-3-dictionary.json', dictionary);
write('data/vocabulary-rebuild/block-3-oxford-application.json', {
  schemaVersion:1,
  blockId:'block-3',
  includedReviewCount:(review.includeLexemes || []).length,
  excludedReviewCount:Object.keys(review.excludeWords || {}).length,
  appliedEntryCount:application.reduce((n,x)=>n+x.addedEntryCount,0),
  application
});

console.log(JSON.stringify({
  includedReviewCount:(review.includeLexemes || []).length,
  excludedReviewCount:Object.keys(review.excludeWords || {}).length,
  appliedEntryCount:application.reduce((n,x)=>n+x.addedEntryCount,0),
  dictionaryEntries:Object.keys(dictionary.entries || {}).length
}, null, 2));
