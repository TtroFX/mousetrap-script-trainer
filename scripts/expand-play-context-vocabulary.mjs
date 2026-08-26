import fs from 'node:fs';
import crypto from 'node:crypto';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const exists = p => fs.existsSync(p);

const SCRIPT = 'mousetrap_script_data.json';
const VOCAB = 'mousetrap_line_vocabulary.json';
const DICT = 'mousetrap_word_dictionary.json';
const CONTRACT = 'data/canonical-production-contract.json';
const MANIFEST = 'data/canonical-integration-manifest.json';
const REPORT = 'data/vocabulary-context-expansion-report.json';

const script = read(SCRIPT);
const originalVocab = read(VOCAB);
const originalDict = read(DICT);

const scenes = [
  ['act1-scene1', 190],
  ['act1-scene2', 336],
  ['act2', 638]
];

const norm = s => String(s || '').toLowerCase().normalize('NFKC')
  .replace(/[‘’“”"']/g, '')
  .replace(/[‐‑‒–—―-]/g, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim().replace(/\s+/g, ' ');
const exactLemmaKey = s => String(s || '').trim().toLowerCase();

const speechById = new Map();
for (const [sceneId, count] of scenes) {
  const rows = script[sceneId]?.speeches;
  if (!Array.isArray(rows) || rows.length !== count) throw new Error(`script count ${sceneId}: ${rows?.length ?? 0}/${count}`);
  rows.forEach((speech, i) => {
    const expected = `${sceneId}-speech-${String(i + 1).padStart(4, '0')}`;
    if (speech.id !== expected || !String(speech.text || '').trim()) throw new Error(`script identity ${expected}`);
    speechById.set(speech.id, { ...speech, sceneId });
  });
}
if (speechById.size !== 1164) throw new Error(`speech total ${speechById.size}/1164`);

const neutralByNorm = new Map();
function addNeutral(lemma, entry) {
  const key = norm(lemma);
  if (!key || neutralByNorm.has(key)) return;
  const meaning = String(entry?.meaning || entry?.coreMeaning || entry?.contextMeaning || '').trim();
  if (!meaning) return;
  neutralByNorm.set(key, {
    lemma: String(lemma).trim(),
    pos: String(entry?.pos || '未分類').trim() || '未分類',
    meaning,
    ipa: String(entry?.ipa || '').trim(),
    forms: String(entry?.forms || '').trim(),
    tags: Array.isArray(entry?.tags) ? entry.tags : []
  });
}
for (const [lemma, entry] of Object.entries(originalDict)) addNeutral(lemma, entry);
for (let i = 1; i <= 6; i += 1) {
  for (const suffix of ['dictionary.json','dictionary-supplement.json','neutral-seed.json','neutral-supplement.json']) {
    const p = `data/vocabulary-rebuild/block-${i}-${suffix}`;
    if (!exists(p)) continue;
    const doc = read(p);
    for (const [lemma, entry] of Object.entries(doc.entries || {})) addNeutral(lemma, entry);
  }
}

const merged = {};
const priorityBySpeech = new Map();
const sourceStats = { existing: 0, contextualReviewed: 0, neutralPromoted: 0, replacedByReviewedContext: 0 };

function put(speechId, raw, priority, source) {
  const speech = speechById.get(speechId);
  if (!speech) throw new Error(`unknown speech ${speechId}`);
  const surface = String(raw?.surface || '').trim();
  const lemma = String(raw?.lemma || '').trim();
  let meaning = String(raw?.meaning || raw?.contextMeaning || '').trim();
  if (!surface || !lemma) throw new Error(`empty surface/lemma ${speechId}`);
  if (!norm(speech.text).includes(norm(surface))) throw new Error(`surface not found ${speechId}: ${surface}`);
  if (!meaning) {
    const neutral = neutralByNorm.get(norm(lemma));
    if (!neutral?.meaning) throw new Error(`no neutral meaning for ${speechId}: ${surface} -> ${lemma}`);
    meaning = neutral.meaning;
  }
  const key = `${norm(surface)}\u0000${exactLemmaKey(lemma)}`;
  const map = priorityBySpeech.get(speechId) || new Map();
  priorityBySpeech.set(speechId, map);
  const existing = map.get(key);
  if (!existing) {
    const playMeaning = source === 'contextualReviewed' ? true : source === 'neutralPromoted' ? false : raw?.playMeaning === true;
    const item = { surface, lemma, meaning, playMeaning, _priority: priority, _source: source };
    (merged[speechId] ||= []).push(item);
    map.set(key, item);
    sourceStats[source] += 1;
    return;
  }
  if (priority > existing._priority) {
    if (source === 'contextualReviewed' && existing._source === 'existing') sourceStats.replacedByReviewedContext += 1;
    sourceStats[existing._source] -= 1;
    existing.surface = surface;
    existing.lemma = lemma;
    existing.meaning = meaning;
    existing.playMeaning = source === 'contextualReviewed' ? true : source === 'neutralPromoted' ? false : raw?.playMeaning === true;
    existing._priority = priority;
    existing._source = source;
    sourceStats[source] += 1;
  }
}

for (const speechId of speechById.keys()) {
  merged[speechId] = [];
  for (const item of originalVocab[speechId] || []) put(speechId, item, 20, 'existing');
}

for (let i = 1; i <= 6; i += 1) {
  const contextPath = `data/vocabulary-rebuild/block-${i}-line-vocabulary.json`;
  const coveragePath = `data/vocabulary-rebuild/block-${i}-b1plus-coverage.json`;
  if (exists(contextPath)) {
    const doc = read(contextPath);
    for (const [speechId, entries] of Object.entries(doc.lines || {})) {
      for (const item of entries || []) {
        const contextMeaning = String(item?.contextMeaning || '').trim();
        if (!contextMeaning) continue;
        put(speechId, { ...item, meaning: contextMeaning }, 30, 'contextualReviewed');
      }
    }
  }
  if (exists(coveragePath)) {
    const doc = read(coveragePath);
    for (const [speechId, entries] of Object.entries(doc.lines || {})) {
      for (const item of entries || []) put(speechId, item, 10, 'neutralPromoted');
    }
  }
}

for (const speechId of speechById.keys()) {
  merged[speechId].sort((a, b) => {
    const text = speechById.get(speechId).text;
    const ai = norm(text).indexOf(norm(a.surface));
    const bi = norm(text).indexOf(norm(b.surface));
    return ai - bi || a.surface.localeCompare(b.surface, 'en', { sensitivity: 'base' });
  });
  merged[speechId] = merged[speechId].map(({ _priority, _source, ...item }) => item);
}

const beforeItems = Object.values(originalVocab).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0);
const afterItems = Object.values(merged).reduce((n, rows) => n + rows.length, 0);
const beforeAnnotated = Object.values(originalVocab).filter(rows => Array.isArray(rows) && rows.length).length;
const afterAnnotated = Object.values(merged).filter(rows => rows.length).length;
if (afterItems <= beforeItems) throw new Error(`vocabulary did not expand: ${afterItems} <= ${beforeItems}`);

const dict = structuredClone(originalDict);
const exactDictKey = new Map(Object.keys(dict).map(k => [exactLemmaKey(k), k]));
const meaningsByLemma = new Map();
for (const rows of Object.values(merged)) {
  for (const item of rows) {
    const k = exactLemmaKey(item.lemma);
    if (!meaningsByLemma.has(k)) meaningsByLemma.set(k, []);
    const arr = meaningsByLemma.get(k);
    if (!arr.includes(item.meaning)) arr.push(item.meaning);
  }
}

let addedDictionary = 0;
let completedDictionary = 0;
for (const rows of Object.values(merged)) {
  for (const item of rows) {
    const lk = exactLemmaKey(item.lemma);
    let dictKey = exactDictKey.get(lk);
    const neutral = neutralByNorm.get(norm(item.lemma));
    const representative = meaningsByLemma.get(lk) || [item.meaning];
    const contextMeaning = representative.slice(0, 4).join('／');
    if (!dictKey) {
      if (!neutral?.meaning) throw new Error(`dictionary source missing for lemma ${item.lemma}`);
      dictKey = item.lemma;
      dict[dictKey] = {
        lemma: item.lemma,
        ipa: neutral.ipa || '',
        pos: neutral.pos || '未分類',
        coreMeaning: neutral.meaning,
        forms: neutral.forms || '文脈に応じた語形・活用を取る。',
        contextMeaning,
        tags: neutral.tags || []
      };
      exactDictKey.set(lk, dictKey);
      addedDictionary += 1;
    } else {
      const entry = dict[dictKey];
      let changed = false;
      if (!String(entry.lemma || '').trim()) { entry.lemma = item.lemma; changed = true; }
      if (!String(entry.pos || '').trim()) { entry.pos = neutral?.pos || '未分類'; changed = true; }
      if (!String(entry.coreMeaning || '').trim()) { entry.coreMeaning = neutral?.meaning || item.meaning; changed = true; }
      if (!String(entry.contextMeaning || '').trim()) { entry.contextMeaning = contextMeaning; changed = true; }
      if (!Array.isArray(entry.tags)) { entry.tags = neutral?.tags || []; changed = true; }
      if (changed) completedDictionary += 1;
    }
  }
}

const dictionaryKeys = new Set(Object.keys(dict).map(exactLemmaKey));
let missingDictionary = 0;
for (const [speechId, rows] of Object.entries(merged)) {
  for (const item of rows) {
    if (!item.surface || !item.lemma || !item.meaning) throw new Error(`empty vocab field ${speechId}`);
    if (!dictionaryKeys.has(exactLemmaKey(item.lemma))) { missingDictionary += 1; throw new Error(`missing dictionary ${item.lemma}`); }
    if (!norm(speechById.get(speechId).text).includes(norm(item.surface))) throw new Error(`post-merge surface mismatch ${speechId}: ${item.surface}`);
  }
}
if (Object.keys(merged).length !== 1164) throw new Error(`vocab speech coverage ${Object.keys(merged).length}/1164`);

write(VOCAB, merged);
write(DICT, dict);

const vocabSha = sha(VOCAB);
const dictSha = sha(DICT);
const contract = read(CONTRACT);
for (const item of contract.files || []) {
  if (item.path === VOCAB) item.sha256 = vocabSha;
  if (item.path === DICT) item.sha256 = dictSha;
}
write(CONTRACT, contract);

const manifest = read(MANIFEST);
manifest.studyAssets ||= {};
manifest.studyAssets.lineVocabulary ||= { file: VOCAB };
manifest.studyAssets.lineVocabulary.sha256 = vocabSha;
manifest.studyAssets.lineVocabulary.coverageSpeechIds = 1164;
manifest.studyAssets.lineVocabulary.items = afterItems;
manifest.studyAssets.lineVocabulary.annotatedSpeeches = afterAnnotated;
manifest.studyAssets.wordDictionary ||= { file: DICT };
manifest.studyAssets.wordDictionary.sha256 = dictSha;
manifest.studyAssets.wordDictionary.entries = Object.keys(dict).length;
manifest.studyAssets.wordDictionary.referencedLemmas = meaningsByLemma.size;
write(MANIFEST, manifest);

function patchRuntimeValidators() {
  const dataPath = 'app/src/data-store.js';
  let data = fs.readFileSync(dataPath, 'utf8');
  data = data.replace(
    "if (Object.keys(value).length !== 578) throw new Error(`dictionary: ${Object.keys(value).length}/578`);",
    "if (Object.keys(value).length < 578) throw new Error(`dictionary: unexpectedly small (${Object.keys(value).length})`); for (const [key, entry] of Object.entries(value)) if (!String(key).trim() || !entry || typeof entry !== 'object' || !String(entry.coreMeaning || '').trim()) throw new Error(`dictionary: invalid entry ${key}`);"
  );
  fs.writeFileSync(dataPath, data);

  const assemblyPath = 'app/scripts/assemble-production.mjs';
  let assembly = fs.readFileSync(assemblyPath, 'utf8');
  assembly = assembly.replace(
    "if(Object.keys(translations).length!==1164||Object.keys(vocabulary).length!==1164||Object.keys(grammar).length!==1164||Object.keys(dictionary).length!==578)fail('canonical coverage counts invalid');",
    "if(Object.keys(translations).length!==1164||Object.keys(vocabulary).length!==1164||Object.keys(grammar).length!==1164||Object.keys(dictionary).length<578)fail('canonical coverage counts invalid');"
  );
  assembly = assembly.replace(
    "const vocabItems=Object.values(vocabulary).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0),grammarItems=Object.values(grammar).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0);if(vocabItems!==1186||grammarItems!==692)fail('annotation item counts invalid');",
    "const vocabItems=Object.values(vocabulary).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0),grammarItems=Object.values(grammar).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0);if(vocabItems<1186||grammarItems!==692)fail('annotation item counts invalid');"
  );
  assembly = assembly.replaceAll('dictionary:578', 'dictionary:Object.keys(dictionary).length');
  fs.writeFileSync(assemblyPath, assembly);
}
patchRuntimeValidators();

const sceneStats = {};
for (const [sceneId, count] of scenes) {
  const ids = Array.from({ length: count }, (_, i) => `${sceneId}-speech-${String(i + 1).padStart(4, '0')}`);
  const rows = ids.map(id => merged[id]);
  sceneStats[sceneId] = {
    speeches: count,
    annotatedSpeeches: rows.filter(x => x.length).length,
    items: rows.reduce((n, x) => n + x.length, 0)
  };
}
const referencedLemmas = new Set(Object.values(merged).flat().map(x => exactLemmaKey(x.lemma)));
const unreferencedDictionary = Object.keys(dict).filter(k => !referencedLemmas.has(exactLemmaKey(k))).length;

const report = {
  schemaVersion: 1,
  status: 'PASS',
  policy: 'Expand occurrence-level play meanings from all reviewed context entries plus all reviewed B1+ candidates. Blank B1+ context meanings are promoted using their neutral dictionary sense.',
  coverage: { speeches: 1164, missingDictionary },
  vocabulary: {
    beforeItems,
    afterItems,
    addedItems: afterItems - beforeItems,
    beforeAnnotatedSpeeches: beforeAnnotated,
    afterAnnotatedSpeeches: afterAnnotated,
    addedAnnotatedSpeeches: afterAnnotated - beforeAnnotated,
    sourceStats,
    sha256: vocabSha
  },
  dictionary: {
    beforeEntries: Object.keys(originalDict).length,
    afterEntries: Object.keys(dict).length,
    addedEntries: addedDictionary,
    completedExistingEntries: completedDictionary,
    referencedLemmas: referencedLemmas.size,
    unreferencedEntries: unreferencedDictionary,
    sha256: dictSha
  },
  sceneStats
};
write(REPORT, report);

const coreDoc = `MOUSETRAP SCRIPT TRAINER - 005 VOCABULARY CORE\n\nMaterial ID: 005\nStatus: EXPANDED / CANONICAL REGISTERED\nValidated payload: ${DICT}\nDictionary entries: ${Object.keys(dict).length}\nReferenced lemmas: ${referencedLemmas.size}\nUnreferenced dictionary entries: ${unreferencedDictionary}\nMissing referenced lemmas: 0\nPayload SHA-256: ${dictSha}\nJoin: exact case-insensitive lemma from 006 line vocabulary.\n\nROLE\n005 is the dictionary-level semantic core. Every occurrence-level vocabulary lemma in 006 must resolve to an entry here. Occurrence-specific meanings remain in 006.\n\nFINAL STATUS: PASS / EXPANDED\n`;
fs.writeFileSync('materials/005_VOCABULARY_CORE.txt', coreDoc);
const sceneLines = scenes.map(([id]) => `${id}: ${sceneStats[id].speeches} speeches / ${sceneStats[id].annotatedSpeeches} annotated / ${sceneStats[id].items} items`).join('\n');
const usageDoc = `MOUSETRAP SCRIPT TRAINER - 006 VOCABULARY USAGE\n\nMaterial ID: 006\nStatus: EXPANDED / CANONICAL REGISTERED\nValidated payload: ${VOCAB}\nCoverage: 1164 / 1164 canonical speech IDs\nLine vocabulary items: ${afterItems}\nAnnotated speeches: ${afterAnnotated}\nAdded items in this expansion: ${afterItems - beforeItems}\nMissing dictionary lemmas: 0\nPayload SHA-256: ${vocabSha}\nJoin key: speechId -> canonical script; lemma -> 005 dictionary.\n\nSCENE INVENTORY\n${sceneLines}\n\nROLE\n006 contains occurrence-specific surface/lemma/meaning information. Reviewed context meanings take priority; reviewed B1+ candidates with no special contextual shift receive the appropriate neutral dictionary sense.\n\nFINAL STATUS: PASS / EXPANDED\n`;
fs.writeFileSync('materials/006_VOCABULARY_USAGE.txt', usageDoc);

console.log(JSON.stringify(report, null, 2));
