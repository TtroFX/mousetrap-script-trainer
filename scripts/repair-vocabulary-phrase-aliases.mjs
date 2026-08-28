import fs from 'node:fs';
import crypto from 'node:crypto';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const write = (path, value) => fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const sha256 = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const norm = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

const DICT_PATH = 'mousetrap_word_dictionary.json';
const VOCAB_PATH = 'mousetrap_line_vocabulary.json';
const CONTRACT_PATH = 'data/canonical-production-contract.json';
const MANIFEST_PATH = 'data/canonical-integration-manifest.json';
const REPORT_PATH = 'data/vocabulary-phrase-alias-report.json';

const dict = read(DICT_PATH);
const vocab = read(VOCAB_PATH);
const dictKeyByLemma = new Map(Object.keys(dict).map(k => [norm(k), k]));

function dictionaryEntry(lemma) {
  const key = dictKeyByLemma.get(norm(lemma));
  if (!key) throw new Error(`dictionary entry missing: ${lemma}`);
  return { key, entry: dict[key] };
}

function longestContext(rows) {
  return rows
    .map(row => String(row.inThisPlay || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || '';
}

let appliedCollapses = 0;
let appliedRetargets = 0;

function collapse(speechId, surface, canonicalLemma, options = {}) {
  const rows = vocab[speechId];
  if (!Array.isArray(rows)) throw new Error(`speech missing: ${speechId}`);
  const surfaceKey = norm(surface);
  const group = rows.filter(row => norm(row.surface) === surfaceKey);
  const canonicalKey = norm(canonicalLemma);

  if (group.length === 1 && norm(group[0].lemma) === canonicalKey) return false;
  if (group.length === 0) {
    const already = rows.some(row => norm(row.lemma) === canonicalKey && norm(row.surface) === surfaceKey);
    if (already) return false;
    throw new Error(`collapse target missing: ${speechId} ${surface}`);
  }

  const { entry } = dictionaryEntry(canonicalLemma);
  const candidate = group.find(row => norm(row.lemma) === canonicalKey) || group[0];
  const context = longestContext(group);
  const playMeaning = group.some(row => row.playMeaning === true);
  const exactSurface = options.surface || candidate.surface || group[0].surface || surface;
  const merged = {
    ...candidate,
    surface: exactSurface,
    lemma: entry.lemma || canonicalLemma,
    meaning: entry.meaning,
    playMeaning
  };
  if (context) merged.inThisPlay = context;
  else delete merged.inThisPlay;

  vocab[speechId] = rows.filter(row => norm(row.surface) !== surfaceKey);
  vocab[speechId].push(merged);
  appliedCollapses += 1;
  return true;
}

function retarget(speechId, fullSurface, lemma, newSurface) {
  const rows = vocab[speechId];
  if (!Array.isArray(rows)) throw new Error(`speech missing: ${speechId}`);
  if (!norm(fullSurface).includes(norm(newSurface))) throw new Error(`retarget is not a substring: ${fullSurface} -> ${newSurface}`);
  const candidates = rows.filter(row => norm(row.surface) === norm(fullSurface) && norm(row.lemma) === norm(lemma));
  if (!candidates.length) {
    const already = rows.some(row => norm(row.surface) === norm(newSurface) && norm(row.lemma) === norm(lemma));
    if (already) return false;
    throw new Error(`retarget target missing: ${speechId} ${fullSurface} ${lemma}`);
  }
  for (const row of candidates) row.surface = newSurface;
  appliedRetargets += candidates.length;
  return true;
}

// Keep phrase-level and constituent-word study entries, but give the constituent
// its actual source substring instead of making two lemmas claim the same span.
const retargets = [
  ['act1-scene1-speech-0005', 'stoke the Aga', 'stoke', 'stoke'],
  ['act1-scene1-speech-0054', 'general dogsbody', 'dogsbody', 'dogsbody'],
  ['act1-scene1-speech-0067', 'Prefab Nests', 'prefab', 'Prefab'],
  ['act1-scene1-speech-0121', 'raising our terms', 'terms', 'terms'],
  ['act1-scene2-speech-0087', 'nylons from Gibraltar', 'nylons', 'nylons'],
  ['act1-scene2-speech-0092', 'tinpot regulation', 'tinpot', 'tinpot'],
  ['act2-speech-0367', 'Whacking great', 'whacking', 'Whacking'],
  ['act2-speech-0372', 'prospective victim', 'prospective', 'prospective'],
  ['act2-speech-0465', 'social reference', 'reference', 'reference'],
  ['act2-speech-0511', 'shrewd suspicion', 'shrewd', 'shrewd'],
  ['act2-speech-0519', 'means of checking', 'means of', 'means of'],
  ['act2-speech-0522', 'means of checking', 'means of', 'means of'],
  ['act2-speech-0524', 'Reconstruction of the crime', 'reconstruction', 'Reconstruction'],
  ['act2-speech-0526', 'reconstruction of the crime', 'reconstruction', 'reconstruction'],
  ['act2-speech-0575', 'firsthand knowledge', 'firsthand', 'firsthand']
];
for (const args of retargets) retarget(...args);

// True alias/lemma collisions: retain exactly one dictionary-normalized entry for
// the source span and carry over the most specific existing play-context note.
const collapses = [
  ['act1-scene1-speech-0032', 'Fourposter', 'four-poster'],
  ['act1-scene1-speech-0046', 'wax flowers', 'wax flower'],
  ['act1-scene1-speech-0054', 'carried away', 'get carried away'],
  ['act1-scene1-speech-0057', 'fourposter', 'four-poster'],
  ['act1-scene1-speech-0097', 'could do with a coat of paint', 'could do with'],
  ['act1-scene1-speech-0099', 'I beg your pardon', 'beg your pardon'],
  ['act1-scene1-speech-0101', 'fourposter', 'four-poster'],
  ['act1-scene1-speech-0118', 'running concern', 'running concern'],
  ['act1-scene1-speech-0121', 'fill your place', "fill someone's place"],
  ['act1-scene1-speech-0122', 'turn me out', 'turn someone out'],
  ['act1-scene1-speech-0126', 'bogged', 'bog down'],
  ['act1-scene1-speech-0126', 'drift', 'drift'],
  ['act1-scene1-speech-0156', 'I daresay', 'i daresay'],
  ['act1-scene1-speech-0159', 'fourposter', 'four-poster'],
  ['act1-scene1-speech-0160', 'fourposter', 'four-poster'],
  ['act1-scene1-speech-0177', 'answer to prayer', 'answer to prayer'],
  ['act1-scene2-speech-0005', 'Cornbeef', 'corned beef'],
  ['act1-scene2-speech-0006', 'cornbeef', 'corned beef'],
  ['act1-scene2-speech-0013', 'I beg your pardon', 'beg your pardon'],
  ['act1-scene2-speech-0058', 'served its purpose', 'serve one’s purpose'],
  ['act1-scene2-speech-0060', 'Tactics', 'tactic'],
  ['act1-scene2-speech-0085', 'implicitly', 'implicitly'],
  ['act1-scene2-speech-0094', 'coalscuttles', 'coal scuttle'],
  ['act1-scene2-speech-0101', 'I beg your pardon', 'beg your pardon'],
  ['act1-scene2-speech-0229', 'distressing', 'distressing'],
  ['act1-scene2-speech-0263', 'Makes his face up', "make one's face up"],
  ['act2-speech-0020', 'a wider field', 'wider field'],
  ['act2-speech-0057', 'making this up', 'make something up'],
  ['act2-speech-0060', 'offended', 'offended'],
  ['act2-speech-0128', 'Japs', 'jap'],
  ['act2-speech-0145', 'gives the sex away', 'give something away'],
  ['act2-speech-0217', 'put it out of my mind', "put something out of one's mind"],
  ['act2-speech-0324', 'reinforcements', 'reinforcement'],
  ['act2-speech-0370', 'put myself in the place of', 'put oneself in the place of'],
  ['act2-speech-0372', 'reproach themselves for', 'reproach oneself for'],
  ['act2-speech-0372', 'come out with it', 'come out with something'],
  ['act2-speech-0392', 'bound for', 'be bound for'],
  ['act2-speech-0417', 'play the markets', 'play the markets'],
  ['act2-speech-0455', 'I beg your pardon', 'beg your pardon'],
  ['act2-speech-0464', 'vouch for you', 'vouch for someone'],
  ['act2-speech-0485', 'I daresay', 'i daresay'],
  ['act2-speech-0501', 'all to no avail', 'all to no avail'],
  ['act2-speech-0583', "didn't bother", 'bother to do something'],
  ['act2-speech-0618', 'fourposter', 'four-poster']
];
for (const args of collapses) collapse(...args);

// The served-its-purpose alias was introduced by an earlier merge and has no
// independent source occurrence after canonicalization. Remove only this proven orphan.
const servedAliasKey = dictKeyByLemma.get(norm('serve its purpose'));
if (servedAliasKey) {
  const stillReferenced = Object.values(vocab).flat().some(row => norm(row.lemma) === norm('serve its purpose'));
  if (stillReferenced) throw new Error('serve its purpose alias still referenced after collapse');
  delete dict[servedAliasKey];
  dictKeyByLemma.delete(norm('serve its purpose'));
}

const conflicts = [];
for (const [speechId, rows] of Object.entries(vocab)) {
  const bySurface = new Map();
  for (const item of rows) {
    const surfaceKey = norm(item.surface);
    const record = bySurface.get(surfaceKey) || { surfaces: new Set(), lemmas: new Set() };
    record.surfaces.add(String(item.surface || ''));
    record.lemmas.add(norm(item.lemma));
    bySurface.set(surfaceKey, record);
  }
  for (const [surfaceKey, record] of bySurface) {
    if (record.lemmas.size > 1) {
      conflicts.push({
        speechId,
        normalizedSurface: surfaceKey,
        surfaces: [...record.surfaces],
        lemmas: [...record.lemmas]
      });
    }
  }
}

write(DICT_PATH, dict);
write(VOCAB_PATH, vocab);
const dictSha = sha256(DICT_PATH);
const vocabSha = sha256(VOCAB_PATH);

const contract = read(CONTRACT_PATH);
for (const file of contract.files || []) {
  if (file.path === DICT_PATH) file.sha256 = dictSha;
  if (file.path === VOCAB_PATH) file.sha256 = vocabSha;
}
write(CONTRACT_PATH, contract);

const manifest = read(MANIFEST_PATH);
if (manifest.studyAssets?.wordDictionary) {
  manifest.studyAssets.wordDictionary.sha256 = dictSha;
  manifest.studyAssets.wordDictionary.entries = Object.keys(dict).length;
}
if (manifest.studyAssets?.lineVocabulary) {
  manifest.studyAssets.lineVocabulary.sha256 = vocabSha;
  manifest.studyAssets.lineVocabulary.items = Object.values(vocab).reduce((n, rows) => n + rows.length, 0);
  manifest.studyAssets.lineVocabulary.annotatedSpeeches = Object.values(vocab).filter(rows => rows.length).length;
}
write(MANIFEST_PATH, manifest);

const referencedLemmas = new Set(Object.values(vocab).flat().map(row => norm(row.lemma)));
const orphanDictionaryEntries = Object.keys(dict).filter(k => !referencedLemmas.has(norm(k))).sort();
const report = {
  schemaVersion: 3,
  status: conflicts.length === 0 ? 'PASS_PHRASE_ALIAS_CLOSURE' : 'REMAINING_SURFACE_LEMMA_CONFLICTS',
  appliedThisRun: {
    collapses: appliedCollapses,
    retargets: appliedRetargets
  },
  remainingSurfaceLemmaConflicts: conflicts.length,
  conflicts,
  orphanDictionaryEntries: orphanDictionaryEntries.length,
  orphanDictionaryLemmas: orphanDictionaryEntries,
  counts: {
    dictionary: Object.keys(dict).length,
    vocabularyItems: Object.values(vocab).reduce((n, rows) => n + rows.length, 0)
  },
  sha256: {
    dictionary: dictSha,
    vocabulary: vocabSha
  }
};
write(REPORT_PATH, report);
console.log(JSON.stringify(report, null, 2));
