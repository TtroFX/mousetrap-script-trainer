import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const abs = p => path.join(ROOT, p);
const readJson = p => JSON.parse(fs.readFileSync(abs(p), 'utf8'));
const writeJson = (p, value) => fs.writeFileSync(abs(p), JSON.stringify(value, null, 2) + '\n');
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(abs(p))).digest('hex');
const fail = message => { throw new Error(message); };
const norm = value => String(value ?? '')
  .normalize('NFKC')
  .toLocaleLowerCase('en')
  .replace(/[‘’]/g, "'")
  .replace(/[‐‑‒–—―-]/g, ' ')
  .replace(/[^\p{L}\p{N}']+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ');
const hasPhrase = (text, phrase) => (` ${norm(text)} `).includes(` ${norm(phrase)} `);

const FILES = {
  script: 'mousetrap_script_data.json',
  vocabulary: 'mousetrap_line_vocabulary.json',
  dictionary: 'mousetrap_word_dictionary.json',
  translations: 'mousetrap_line_translations.json',
  grammar: 'mousetrap_line_grammar.json',
  contract: 'data/canonical-production-contract.json',
  manifest: 'data/canonical-integration-manifest.json',
  assembler: 'app/scripts/assemble-production.mjs',
  patchMeta: 'data/fourth-quarter-noun-expansion-v2/meta.json',
  patchParts: ['data/fourth-quarter-noun-expansion-v2/part-01.json','data/fourth-quarter-noun-expansion-v2/part-02.json','data/fourth-quarter-noun-expansion-v2/part-03.json','data/fourth-quarter-noun-expansion-v2/part-04.json'],
  report: 'data/fourth-quarter-noun-expansion-v2-qa.json'
};

const patch = readJson(FILES.patchMeta);
patch.lineRules = FILES.patchParts.flatMap(readJson);
patch.dictionaryOnly = [];
if (patch?.schemaVersion !== 1 || patch?.patchId !== 'fourth-quarter-noun-expansion-v2-2026-09-01') fail('Unexpected patch identity');
const scope = patch.scope || {};
if (JSON.stringify(scope.globalSpeechRange) !== JSON.stringify([874, 1164]) || scope.speechCount !== 291) fail('Unexpected patch scope');
if (scope.first !== 'act2-speech-0348' || scope.last !== 'act2-speech-0638') fail('Unexpected scope boundary');
if (!Array.isArray(patch.lineRules) || patch.lineRules.length < 80) fail('Part 4 expansion rule set unexpectedly small');

const script = readJson(FILES.script);
const vocabulary = readJson(FILES.vocabulary);
const dictionary = readJson(FILES.dictionary);
const sceneSpecs = [['act1-scene1', 190], ['act1-scene2', 336], ['act2', 638]];
const allSpeechIds = [];
for (const [sceneId, count] of sceneSpecs) {
  const rows = script[sceneId]?.speeches;
  if (!Array.isArray(rows) || rows.length !== count) fail(`Canonical script count mismatch: ${sceneId}`);
  rows.forEach((row, index) => {
    const expected = `${sceneId}-speech-${String(index + 1).padStart(4, '0')}`;
    if (row?.id !== expected || row?.ordinal !== index + 1 || !String(row?.speaker || '').trim() || !String(row?.text || '').trim()) fail(`Canonical script invariant failed: ${expected}`);
    allSpeechIds.push(row.id);
  });
}
if (allSpeechIds.length !== 1164 || new Set(allSpeechIds).size !== 1164) fail('Canonical speech coverage invalid');
for (const id of allSpeechIds) if (!Array.isArray(vocabulary[id])) fail(`Vocabulary missing speech key: ${id}`);

const targetSpeeches = script['act2'].speeches.slice(347);
if (targetSpeeches.length !== 291 || targetSpeeches[0]?.id !== scope.first || targetSpeeches.at(-1)?.id !== scope.last) fail('Target extraction failed');
const targetIds = new Set(targetSpeeches.map(x => x.id));
const outOfScopeSnapshot = new Map(allSpeechIds.filter(id => !targetIds.has(id)).map(id => [id, JSON.stringify(vocabulary[id])]));
const beforeTargetItems = targetSpeeches.reduce((n, speech) => n + vocabulary[speech.id].length, 0);
const beforeAllItems = Object.values(vocabulary).reduce((n, rows) => n + rows.length, 0);
const beforeDictionaryEntries = Object.keys(dictionary).length;
const protectedHashes = { script: sha256(FILES.script), translations: sha256(FILES.translations), grammar: sha256(FILES.grammar) };

const dictKeyByNorm = new Map();
for (const key of Object.keys(dictionary)) {
  const n = norm(key);
  if (!n) fail(`Dictionary key normalizes empty: ${key}`);
  if (!dictKeyByNorm.has(n)) dictKeyByNorm.set(n, key);
}

let newDictionaryEntries = 0;
function ensureDictionary(lemma, spec) {
  const n = norm(lemma);
  let key = Object.prototype.hasOwnProperty.call(dictionary, lemma) ? lemma : dictKeyByNorm.get(n);
  if (key) {
    const entry = dictionary[key];
    if (!entry || typeof entry !== 'object' || !String(entry.meaning || '').trim() || !String(entry.coreMeaning || '').trim()) fail(`Invalid existing dictionary entry: ${key}`);
    if (String(entry.meaning).trim() !== String(entry.coreMeaning).trim()) fail(`Existing dictionary meaning/core mismatch: ${key}`);
    return entry;
  }
  const meaning = String(spec?.meaning || '').trim();
  const pos = String(spec?.pos || '').trim();
  if (!meaning || !pos) fail(`New dictionary entry missing meaning/pos: ${lemma}`);
  key = String(lemma).trim();
  dictionary[key] = {
    lemma: key,
    pos,
    coreMeaning: meaning,
    tags: Array.isArray(spec?.tags) ? [...new Set(spec.tags.map(x => String(x).trim()).filter(Boolean))] : [],
    meaning
  };
  dictKeyByNorm.set(n, key);
  newDictionaryEntries += 1;
  return dictionary[key];
}

const stats = {
  reviewedSpeeches: 291,
  candidateRules: patch.lineRules.length,
  matchedRules: 0,
  matchedOccurrences: 0,
  newVocabularyItems: 0,
  alreadyPresentOccurrences: 0,
  polysemySkippedWithoutCuratedContext: 0,
  newDictionaryEntries: 0,
  nounFocusedRules: 0,
  multiwordRules: 0,
  inThisPlayAdded: 0
};
const skippedPolysemy = [];
const ruleIdentity = new Set();

for (const rule of patch.lineRules) {
  const surface = String(rule?.surface || '').trim();
  const lemma = String(rule?.lemma || '').trim();
  if (!surface || !lemma) fail('Patch rule missing surface/lemma');
  const rid = `${norm(surface)}\u0000${norm(lemma)}`;
  if (ruleIdentity.has(rid)) fail(`Duplicate patch rule: ${surface}/${lemma}`);
  ruleIdentity.add(rid);
  if (/名詞/.test(String(rule?.dictionary?.pos || ''))) stats.nounFocusedRules += 1;
  if (/\s/.test(lemma)) stats.multiwordRules += 1;

  const allowed = Array.isArray(rule.speechIds) && rule.speechIds.length ? new Set(rule.speechIds) : null;
  if (allowed && [...allowed].some(id => !targetIds.has(id))) fail(`Rule speechIds escape Part 4: ${surface}`);
  const matches = targetSpeeches.filter(speech => (!allowed || allowed.has(speech.id)) && hasPhrase(speech.text, surface));
  const expectedMin = Math.max(1, Number.isInteger(rule.expectedMin) ? rule.expectedMin : 1);
  if (matches.length < expectedMin) fail(`Rule match below minimum ${matches.length}/${expectedMin}: ${surface}/${lemma}`);
  stats.matchedRules += 1;
  stats.matchedOccurrences += matches.length;

  const dictEntry = ensureDictionary(lemma, rule.dictionary || {});
  const finalMeaning = String(dictEntry.meaning || '').trim();
  const dictionaryIsPolysemous = Array.isArray(dictEntry.tags) && dictEntry.tags.includes('polysemy');
  const curatedContext = String(rule.inThisPlay || '').trim();

  for (const speech of matches) {
    const rows = vocabulary[speech.id];
    const existing = rows.find(item => norm(item?.surface) === norm(surface));
    if (existing) {
      stats.alreadyPresentOccurrences += 1;
      continue;
    }
    if (dictionaryIsPolysemous && !curatedContext) {
      stats.polysemySkippedWithoutCuratedContext += 1;
      skippedPolysemy.push({ speechId: speech.id, surface, lemma });
      continue;
    }
    const item = { surface, lemma, meaning: finalMeaning, playMeaning: true };
    if (curatedContext) { item.inThisPlay = curatedContext; stats.inThisPlayAdded += 1; }
    rows.push(item);
    stats.newVocabularyItems += 1;
  }
}
stats.newDictionaryEntries = newDictionaryEntries;
if (stats.newVocabularyItems < 1) fail('Part 4 expansion produced no new line vocabulary');

for (const [id, before] of outOfScopeSnapshot) if (JSON.stringify(vocabulary[id]) !== before) fail(`Out-of-scope vocabulary changed: ${id}`);

writeJson(FILES.vocabulary, vocabulary);
writeJson(FILES.dictionary, dictionary);

const dictionaryByNorm = new Map();
for (const [key, entry] of Object.entries(dictionary)) {
  const n = norm(key);
  if (!dictionaryByNorm.has(n)) dictionaryByNorm.set(n, entry);
}
const dictionaryEntryForLemma = lemma => Object.prototype.hasOwnProperty.call(dictionary, lemma) ? dictionary[lemma] : dictionaryByNorm.get(norm(lemma));
let vocabItems = 0, playMeaningItems = 0, neutralOnlyItems = 0, inThisPlayItems = 0, annotatedSpeeches = 0;
const referencedLemmas = new Set();
for (const id of allSpeechIds) {
  const rows = vocabulary[id];
  if (rows.length) annotatedSpeeches += 1;
  const seen = new Set();
  for (const item of rows) {
    const surface = String(item?.surface || '').trim();
    const lemma = String(item?.lemma || '').trim();
    const meaning = String(item?.meaning || '').trim();
    if (!surface || !lemma || !meaning || typeof item.playMeaning !== 'boolean') fail(`Invalid vocabulary entry: ${id}`);
    const pair = `${norm(surface)}\u0000${norm(lemma)}`;
    if (seen.has(pair)) fail(`Duplicate vocabulary pair: ${id}/${surface}/${lemma}`);
    seen.add(pair);
    const dict = dictionaryEntryForLemma(lemma);
    if (!dict) fail(`Missing dictionary lemma: ${id}/${lemma}`);
    if (String(dict.meaning || '').trim() !== meaning) fail(`Meaning mismatch: ${id}/${lemma}`);
    if (Object.prototype.hasOwnProperty.call(item, 'inThisPlay')) {
      const text = String(item.inThisPlay || '').trim();
      if (!text || text.length > 360 || text === meaning) fail(`Invalid inThisPlay: ${id}/${lemma}`);
      inThisPlayItems += 1;
    }
    referencedLemmas.add(norm(lemma));
    vocabItems += 1;
    item.playMeaning ? playMeaningItems += 1 : neutralOnlyItems += 1;
  }
}
for (const [key, entry] of Object.entries(dictionary)) {
  if (!entry || typeof entry !== 'object') fail(`Invalid dictionary object: ${key}`);
  const meaning = String(entry.meaning || '').trim();
  const coreMeaning = String(entry.coreMeaning || '').trim();
  if (!meaning || meaning !== coreMeaning || !String(entry.pos || '').trim()) fail(`Invalid dictionary entry: ${key}`);
  if (Object.prototype.hasOwnProperty.call(entry, 'contextMeaning') || Object.prototype.hasOwnProperty.call(entry, 'contextExplanation')) fail(`Play context leaked into dictionary: ${key}`);
  if (Object.prototype.hasOwnProperty.call(entry, 'pattern') || Object.prototype.hasOwnProperty.call(entry, 'patternDesc')) fail(`Pattern fields leaked into dictionary: ${key}`);
}
const afterTargetItems = targetSpeeches.reduce((n, speech) => n + vocabulary[speech.id].length, 0);
if (afterTargetItems - beforeTargetItems !== stats.newVocabularyItems) fail('Target item delta does not match additions');
if (vocabItems - beforeAllItems !== stats.newVocabularyItems) fail('Whole-play item delta does not match additions');
if (Object.keys(dictionary).length - beforeDictionaryEntries !== newDictionaryEntries) fail('Dictionary delta does not match additions');

const afterProtectedHashes = { script: sha256(FILES.script), translations: sha256(FILES.translations), grammar: sha256(FILES.grammar) };
if (JSON.stringify(protectedHashes) !== JSON.stringify(afterProtectedHashes)) fail('Unrelated canonical source changed');

const contract = readJson(FILES.contract);
if (contract.schemaVersion !== 1 || !Array.isArray(contract.files) || contract.files.length !== 5) fail('Canonical contract schema invalid');
const contractByPath = new Map(contract.files.map(item => [item.path, item]));
for (const p of [FILES.script, FILES.translations, FILES.vocabulary, FILES.grammar, FILES.dictionary]) {
  const item = contractByPath.get(p);
  if (!item) fail(`Canonical contract missing: ${p}`);
  item.sha256 = sha256(p);
}
writeJson(FILES.contract, contract);

const manifest = readJson(FILES.manifest);
if (manifest.studyAssets?.lineVocabulary) Object.assign(manifest.studyAssets.lineVocabulary, {
  sha256: sha256(FILES.vocabulary), coverageSpeechIds: 1164, items: vocabItems,
  annotatedSpeeches, playMeaningItems, neutralOnlyItems, inThisPlayItems
});
if (manifest.studyAssets?.wordDictionary) Object.assign(manifest.studyAssets.wordDictionary, {
  sha256: sha256(FILES.dictionary), entries: Object.keys(dictionary).length, referencedLemmas: referencedLemmas.size
});
writeJson(FILES.manifest, manifest);

// The production assembler validates vocabulary counts dynamically; no generated count constant needs rewriting.

const semanticOutput = execFileSync(process.execPath, ['scripts/validate-vocabulary-semantics.mjs'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const semanticJson = JSON.parse(semanticOutput);
if (semanticJson.status !== 'PASS') fail('Vocabulary semantic validator did not PASS');
const productionOutput = execFileSync(process.execPath, ['scripts/assemble-production.mjs', '--verify-only'], { cwd: abs('app'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const productionJson = JSON.parse(productionOutput);
if (productionJson.status !== 'PASS') fail('Production verifier did not PASS');

const report = {
  schemaVersion: 1,
  patchId: patch.patchId,
  status: 'PASS',
  scope,
  policy: patch.policy,
  before: { targetVocabularyItems: beforeTargetItems, allVocabularyItems: beforeAllItems, dictionaryEntries: beforeDictionaryEntries },
  stats,
  after: {
    targetVocabularyItems: afterTargetItems,
    allVocabularyItems: vocabItems,
    dictionaryEntries: Object.keys(dictionary).length,
    annotatedSpeeches,
    playMeaningItems,
    neutralOnlyItems,
    inThisPlayItems,
    referencedDictionaryLemmas: referencedLemmas.size
  },
  qa: {
    canonicalSpeechCoverage: 'PASS',
    exactPart4Boundary: 'PASS',
    allCandidateRulesMatchedSource: 'PASS',
    outOfScopeLineMutationCheck: 'PASS',
    outOfScopeLineMutations: 0,
    duplicateVocabularyPairs: 0,
    missingDictionaryReferences: 0,
    dictionaryMeaningConsistency: 'PASS',
    optionalInThisPlayContract: 'PASS',
    semanticValidator: semanticJson,
    productionVerifier: productionJson,
    protectedCanonicalSourcesUnchanged: true
  },
  skippedPolysemyWithoutCuratedContext: skippedPolysemy,
  hashes: { vocabulary: sha256(FILES.vocabulary), dictionary: sha256(FILES.dictionary) }
};
writeJson(FILES.report, report);
for (const item of contract.files) if (sha256(item.path) !== item.sha256) fail(`Post-QA canonical SHA mismatch: ${item.path}`);
console.log(JSON.stringify(report, null, 2));
