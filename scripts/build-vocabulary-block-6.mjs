import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const script = read('mousetrap_script_data.json');
const oldVocab = read('mousetrap_line_vocabulary.json');
const oldDict = read('mousetrap_word_dictionary.json');
const contextSeed = read('data/vocabulary-rebuild/block-6-context-seed.json');
const seed = read('data/vocabulary-rebuild/block-6-neutral-seed.json').entries || {};

const previous = {};
for (let i = 1; i <= 5; i += 1) {
  Object.assign(previous, read(`data/vocabulary-rebuild/block-${i}-dictionary.json`).entries || {});
  Object.assign(previous, read(`data/vocabulary-rebuild/block-${i}-dictionary-supplement.json`).entries || {});
}

const blockId = 'block-6';
const sceneId = 'act2';
const first = 424;
const last = 638;
const speeches = script[sceneId].speeches.slice(first - 1, last);
const expectedIds = new Set(speeches.map(s => s.id));

const norm = s => String(s || '').toLowerCase().normalize('NFKC')
  .replace(/[‘’“”"']/g, '')
  .replace(/[‐‑‒–—―-]/g, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim().replace(/\s+/g, ' ');

const contextLines = {};
for (const [speechId, entries] of Object.entries(contextSeed.lines || {})) {
  if (!expectedIds.has(speechId)) throw new Error(`Context seed outside Block 6: ${speechId}`);
  const speech = speeches.find(s => s.id === speechId);
  contextLines[speechId] = [];
  for (const entry of entries || []) {
    const surface = String(entry.surface || '').trim();
    const lemma = String(entry.lemma || '').trim();
    const contextMeaning = String(entry.contextMeaning || '').trim();
    if (!surface || !lemma || !contextMeaning) throw new Error(`Invalid context seed: ${speechId}`);
    if (!norm(speech.text).includes(norm(surface))) throw new Error(`Context surface not found: ${speechId} / ${surface}`);
    contextLines[speechId].push({ surface, lemma, contextMeaning });
  }
}

const pairKeys = new Set();
for (const [speechId, entries] of Object.entries(contextLines)) {
  for (const e of entries) pairKeys.add(`${speechId}\u0000${norm(e.surface)}\u0000${e.lemma}`);
}

const thresholdLines = {};
const legacyMeaning = new Map();
for (const speech of speeches) {
  for (const item of oldVocab[speech.id] || []) {
    const surface = String(item?.surface || '').trim();
    const lemma = String(item?.lemma || '').trim();
    const meaning = String(item?.meaning || '').trim();
    if (!surface || !lemma) continue;
    if (!norm(speech.text).includes(norm(surface))) continue;
    if (meaning && !legacyMeaning.has(lemma)) legacyMeaning.set(lemma, meaning);
    const key = `${speech.id}\u0000${norm(surface)}\u0000${lemma}`;
    if (pairKeys.has(key)) continue;
    (thresholdLines[speech.id] ||= []).push({
      surface,
      lemma,
      contextMeaning: '',
      source: 'legacy-curated-candidate'
    });
    pairKeys.add(key);
  }
}

for (const lines of [contextLines, thresholdLines]) {
  for (const entries of Object.values(lines)) entries.sort((a,b)=>String(a.surface).localeCompare(String(b.surface),'en',{sensitivity:'base'}));
}

const selectedLemmas = new Set();
for (const source of [contextLines, thresholdLines]) for (const entries of Object.values(source)) for (const e of entries) selectedLemmas.add(e.lemma);

function findOldDictionaryEntry(lemma) {
  if (oldDict[lemma]) return oldDict[lemma];
  const target = norm(lemma);
  for (const [key, value] of Object.entries(oldDict)) if (norm(key) === target || norm(value?.lemma) === target) return value;
  return null;
}
function neutralize(entry) {
  const meaning = String(entry?.meaning || entry?.coreMeaning || '').trim();
  if (!meaning) return null;
  const out = {
    pos: String(entry?.pos || '未分類').trim() || '未分類',
    meaning
  };
  if (Array.isArray(entry?.tags) && entry.tags.length) out.tags = entry.tags;
  if (String(entry?.forms || '').trim()) out.forms = entry.forms;
  if (String(entry?.ipa || '').trim()) out.ipa = entry.ipa;
  return out;
}

const dictionaryEntries = {};
const fallbackEntries = {};
for (const lemma of [...selectedLemmas].sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}))) {
  let entry = neutralize(seed[lemma]) || neutralize(previous[lemma]);
  if (!entry) {
    const old = findOldDictionaryEntry(lemma);
    if (old?.coreMeaning) entry = neutralize({ ...old, meaning: old.coreMeaning });
  }
  if (!entry) {
    const meaning = legacyMeaning.get(lemma);
    if (meaning) {
      entry = { pos: '未分類', meaning };
      fallbackEntries[lemma] = {
        pos: '未分類',
        meaning,
        reason: 'No neutral dictionary entry; legacy line meaning used only as temporary fallback.'
      };
    }
  }
  if (!entry) throw new Error(`No neutral meaning available for selected lemma: ${lemma}`);
  dictionaryEntries[lemma] = entry;
}

const contextDoc = {
  schemaVersion: 2,
  blockId,
  sceneId,
  processedSpeechRange: [first, last],
  processedSpeechCount: speeches.length,
  policy: 'Context-specific meanings first; blank means neutral dictionary sense is sufficient.',
  lines: contextLines
};
const thresholdDoc = {
  schemaVersion: 2,
  blockId,
  sceneId,
  processedSpeechRange: [first, last],
  processedSpeechCount: speeches.length,
  policy: 'Existing curated candidates are retained with blank contextMeaning; Oxford review adds any missing B1+ uses.',
  lines: thresholdLines
};
const dictionaryDoc = {
  schemaVersion: 2,
  blockId,
  policy: 'Neutral meanings only. Context-specific meaning belongs to line vocabulary.',
  entries: dictionaryEntries
};
const supplementDoc = { schemaVersion: 1, blockId, entries: {} };
const fallbackDoc = { schemaVersion: 1, blockId, count: Object.keys(fallbackEntries).length, entries: fallbackEntries };

write('data/vocabulary-rebuild/block-6-line-vocabulary.json', contextDoc);
write('data/vocabulary-rebuild/block-6-b1plus-coverage.json', thresholdDoc);
write('data/vocabulary-rebuild/block-6-dictionary.json', dictionaryDoc);
write('data/vocabulary-rebuild/block-6-dictionary-supplement.json', supplementDoc);
write('data/vocabulary-rebuild/block-6-neutral-fallbacks.json', fallbackDoc);
write('data/vocabulary-rebuild/block-6-build-report.json', {
  schemaVersion: 1,
  blockId,
  speeches: speeches.length,
  contextEntries: Object.values(contextLines).reduce((n,a)=>n+a.length,0),
  thresholdEntries: Object.values(thresholdLines).reduce((n,a)=>n+a.length,0),
  lemmas: selectedLemmas.size,
  neutralFallbacks: fallbackDoc.count
});
console.log(JSON.stringify({
  speeches: speeches.length,
  contextEntries: Object.values(contextLines).reduce((n,a)=>n+a.length,0),
  thresholdEntries: Object.values(thresholdLines).reduce((n,a)=>n+a.length,0),
  lemmas: selectedLemmas.size,
  neutralFallbacks: fallbackDoc.count
}, null, 2));
