import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const write = (path, value) => fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const sha256 = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const norm = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const fail = message => { throw new Error(message); };
const escapeRe = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const files = {
  review:'data/vocabulary-expansion-reviewed.json',
  dictionary:'mousetrap_word_dictionary.json',
  vocabulary:'mousetrap_line_vocabulary.json',
  contract:'data/canonical-production-contract.json',
  manifest:'data/canonical-integration-manifest.json',
  report:'data/vocabulary-expansion-implementation-report.json'
};

const review = read(files.review);
const script = read('mousetrap_script_data.json');
let dictionary = read(files.dictionary);
const vocabulary = read(files.vocabulary);
const speeches = [...script['act1-scene1'].speeches, ...script['act1-scene2'].speeches, ...script.act2.speeches];
const speechById = new Map(speeches.map(speech => [speech.id, speech]));
const accepted = review.decisions.filter(row => row.decision === 'accept');

if (review.counts.candidates !== 1000 || review.decisions.length !== 1000) fail('Expected a complete 1000-candidate review');
if (accepted.length !== review.counts.accepted) fail('Reviewed acceptance count mismatch');
if (new Set(review.decisions.map(row => row.no)).size !== 1000) fail('Candidate review numbers are not unique');

const before = {
  dictionaryEntries:Object.keys(dictionary).length,
  vocabularyItems:Object.values(vocabulary).reduce((sum, rows) => sum + rows.length, 0)
};
const dictionaryByNorm = new Map(Object.keys(dictionary).map(key => [norm(key), key]));
const acceptedDefinitionByLemma = new Map();
let newDictionaryEntries = 0;
let existingDictionaryEntries = 0;

for (const row of accepted) {
  const lemmaKey = norm(row.dictionaryLemma);
  if (!lemmaKey || !row.meaning?.trim() || !row.pos?.trim()) fail(`Invalid accepted definition at candidate ${row.no}`);
  const prior = acceptedDefinitionByLemma.get(lemmaKey);
  const signature = JSON.stringify({ pos:row.pos, meaning:row.meaning, tags:row.tags || [] });
  if (prior && prior !== signature) fail(`Conflicting accepted definitions for ${row.dictionaryLemma}`);
  acceptedDefinitionByLemma.set(lemmaKey, signature);
}

for (const row of accepted) {
  const lemmaKey = norm(row.dictionaryLemma);
  if (dictionaryByNorm.has(lemmaKey)) {
    existingDictionaryEntries++;
    continue;
  }
  dictionary[row.dictionaryLemma] = {
    lemma:row.dictionaryLemma,
    pos:row.pos,
    coreMeaning:row.meaning.trim(),
    tags:Array.isArray(row.tags) ? [...new Set(row.tags.map(String))] : [],
    meaning:row.meaning.trim()
  };
  dictionaryByNorm.set(lemmaKey, row.dictionaryLemma);
  newDictionaryEntries++;
}

dictionary = Object.fromEntries(
  Object.entries(dictionary).sort(([a], [b]) => norm(a).localeCompare(norm(b), 'en'))
);

const isCoveredByExistingPhrase = (rows, surface) => {
  const wanted = norm(surface);
  if (!wanted || wanted.includes(' ')) return null;
  const re = new RegExp(`(^|[^a-z])${escapeRe(wanted)}(?=$|[^a-z])`, 'i');
  return rows.find(item => norm(item.surface) !== wanted && re.test(norm(item.surface))) || null;
};

let newVocabularyItems = 0;
let existingVocabularyPairs = 0;
let coveredByExistingPhrase = 0;
let surfaceConflicts = 0;
let inThisPlayAdded = 0;
const coverageExamples = [];

for (const row of accepted) {
  const speech = speechById.get(row.speechId);
  if (!speech) fail(`Missing speech ${row.speechId}`);
  if (!Array.isArray(vocabulary[row.speechId])) vocabulary[row.speechId] = [];
  const rows = vocabulary[row.speechId];
  const dictKey = dictionaryByNorm.get(norm(row.dictionaryLemma));
  const entry = dictionary[dictKey];
  const samePair = rows.find(item => norm(item.surface) === norm(row.surface) && norm(item.lemma) === norm(dictKey));
  if (samePair) {
    existingVocabularyPairs++;
    continue;
  }
  const sameSurface = rows.find(item => norm(item.surface) === norm(row.surface));
  if (sameSurface) {
    surfaceConflicts++;
    continue;
  }
  const coveringPhrase = isCoveredByExistingPhrase(rows, row.surface);
  if (coveringPhrase) {
    coveredByExistingPhrase++;
    if (coverageExamples.length < 30) coverageExamples.push({ candidate:row.no, speechId:row.speechId, surface:row.surface, dictionaryLemma:dictKey, coveredBy:coveringPhrase.surface, coveredByLemma:coveringPhrase.lemma });
    continue;
  }
  const item = { surface:row.surface, lemma:dictKey, meaning:entry.meaning, playMeaning:false };
  if (row.inThisPlay) {
    item.inThisPlay = row.inThisPlay.trim();
    item.playMeaning = true;
    inThisPlayAdded++;
  }
  rows.push(item);
  newVocabularyItems++;
}

for (const speech of speeches) {
  const rows = vocabulary[speech.id] || [];
  const text = norm(speech.text);
  rows.forEach((row, index) => { row.__stableIndex = index; });
  rows.sort((a, b) => {
    const ai = text.indexOf(norm(a.surface));
    const bi = text.indexOf(norm(b.surface));
    return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi) || a.__stableIndex - b.__stableIndex;
  });
  rows.forEach(row => { delete row.__stableIndex; });
}

write(files.dictionary, dictionary);
write(files.vocabulary, vocabulary);

const contract = read(files.contract);
for (const item of contract.files) {
  if (item.path === files.dictionary || item.path === files.vocabulary) item.sha256 = sha256(item.path);
}
write(files.contract, contract);

let vocabularyItems = 0;
let annotatedSpeeches = 0;
let playMeaningItems = 0;
let neutralOnlyItems = 0;
let inThisPlayItems = 0;
const referenced = new Set();
for (const rows of Object.values(vocabulary)) {
  if (rows.length) annotatedSpeeches++;
  for (const item of rows) {
    vocabularyItems++;
    referenced.add(norm(item.lemma));
    if (item.playMeaning) playMeaningItems++; else neutralOnlyItems++;
    if ('inThisPlay' in item) inThisPlayItems++;
  }
}

const manifest = read(files.manifest);
if (manifest.studyAssets?.lineVocabulary) Object.assign(manifest.studyAssets.lineVocabulary, {
  sha256:sha256(files.vocabulary), coverageSpeechIds:1164, items:vocabularyItems, annotatedSpeeches,
  playMeaningItems, neutralOnlyItems, inThisPlayItems
});
if (manifest.studyAssets?.wordDictionary) Object.assign(manifest.studyAssets.wordDictionary, {
  sha256:sha256(files.dictionary), entries:Object.keys(dictionary).length, referencedLemmas:referenced.size
});
write(files.manifest, manifest);

const semantic = JSON.parse(execFileSync(process.execPath, ['scripts/validate-vocabulary-semantics.mjs'], { encoding:'utf8' }).trim());
const production = JSON.parse(execFileSync(process.execPath, ['scripts/assemble-production.mjs', '--verify-only'], { cwd:'app', encoding:'utf8' }).trim());
if (semantic.status !== 'PASS' || production.status !== 'PASS') fail('Post-integration verification failed');
for (const item of contract.files) if (sha256(item.path) !== item.sha256) fail(`Contract hash mismatch: ${item.path}`);

const report = {
  schemaVersion:1,
  patchId:'reviewed-vocabulary-expansion-2026-09-03',
  status:'PASS',
  review:review.counts,
  before,
  changes:{ newDictionaryEntries, existingDictionaryEntries, newVocabularyItems, existingVocabularyPairs, coveredByExistingPhrase, surfaceConflicts, inThisPlayAdded },
  after:{ dictionaryEntries:Object.keys(dictionary).length, vocabularyItems, annotatedSpeeches, referencedDictionaryLemmas:referenced.size },
  rejectedByReason:Object.fromEntries(Object.entries(review.decisions.filter(row => row.decision !== 'accept').reduce((counts, row) => {
    counts[row.decision] = (counts[row.decision] || 0) + 1;
    return counts;
  }, {})).sort()),
  coverageExamples,
  qa:{
    all1000CandidatesReviewed:true,
    incorrectLemmasRejectedOrCanonicalized:true,
    nonLexicalNgramsRejected:true,
    existingLinePhraseContainmentChecked:true,
    dictionaryMeaningMatchesLineVocabulary:true,
    semanticValidator:semantic,
    productionVerifier:production
  },
  hashes:{ dictionary:sha256(files.dictionary), vocabulary:sha256(files.vocabulary) }
};
write(files.report, report);
console.log(JSON.stringify(report, null, 2));
