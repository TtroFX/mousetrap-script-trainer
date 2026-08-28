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
const canonicalLemma = 'serve one’s purpose';
const aliasLemma = 'serve its purpose';
const targetSpeechId = 'act1-scene2-speech-0058';
const targetSurface = 'served its purpose';

const canonicalKey = Object.keys(dict).find(k => norm(k) === norm(canonicalLemma));
const aliasKey = Object.keys(dict).find(k => norm(k) === norm(aliasLemma));
if (!canonicalKey) throw new Error(`canonical dictionary entry missing: ${canonicalLemma}`);
const canonical = dict[canonicalKey];
const rows = vocab[targetSpeechId];
if (!Array.isArray(rows)) throw new Error(`target speech missing: ${targetSpeechId}`);

const targetRows = rows.filter(item => norm(item.surface) === norm(targetSurface));
const targetLemmasBefore = [...new Set(targetRows.map(item => norm(item.lemma)))];
if (!targetLemmasBefore.includes(norm(canonicalLemma)) || !targetLemmasBefore.includes(norm(aliasLemma))) {
  throw new Error(`expected phrase alias collision not found: ${JSON.stringify(targetLemmasBefore)}`);
}

const keep = rows.filter(item => norm(item.surface) !== norm(targetSurface));
keep.push({
  surface: targetSurface,
  lemma: canonical.lemma || canonicalKey,
  meaning: canonical.meaning,
  playMeaning: true,
  inThisPlay: 'ラジオを大きくしてMrs. Boyleを別室へ行かせ、Casewellが暖かい椅子を取るという作戦が目的を果たした、という意味。'
});
vocab[targetSpeechId] = keep;

if (aliasKey) delete dict[aliasKey];

const conflicts = [];
for (const [speechId, speechRows] of Object.entries(vocab)) {
  const bySurface = new Map();
  for (const item of speechRows) {
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
  manifest.studyAssets.lineVocabulary.items = Object.values(vocab).reduce((n, speechRows) => n + speechRows.length, 0);
  manifest.studyAssets.lineVocabulary.annotatedSpeeches = Object.values(vocab).filter(speechRows => speechRows.length).length;
}
write(MANIFEST_PATH, manifest);

const canonicalRowsAfter = vocab[targetSpeechId].filter(item => norm(item.surface) === norm(targetSurface));
const report = {
  schemaVersion: 1,
  status: conflicts.length === 0 ? 'PASS_PHRASE_ALIAS_CLOSURE' : 'REMAINING_SURFACE_LEMMA_CONFLICTS',
  repaired: {
    speechId: targetSpeechId,
    surface: targetSurface,
    removedDictionaryAlias: Boolean(aliasKey),
    lemmasBefore: targetLemmasBefore,
    lemmaAfter: canonicalRowsAfter.map(item => item.lemma),
    occurrencesAfter: canonicalRowsAfter.length
  },
  remainingSurfaceLemmaConflicts: conflicts.length,
  conflicts,
  counts: {
    dictionary: Object.keys(dict).length,
    vocabularyItems: Object.values(vocab).reduce((n, speechRows) => n + speechRows.length, 0)
  },
  sha256: {
    dictionary: dictSha,
    vocabulary: vocabSha
  }
};
write(REPORT_PATH, report);
console.log(JSON.stringify(report, null, 2));
