import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
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
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ');
const mergeTags = (...groups) => [...new Set(groups.flatMap(x => Array.isArray(x) ? x : []).map(x => String(x).trim()).filter(Boolean))];

const FILES = {
  script: 'mousetrap_script_data.json',
  vocabulary: 'mousetrap_line_vocabulary.json',
  dictionary: 'mousetrap_word_dictionary.json',
  translations: 'mousetrap_line_translations.json',
  grammar: 'mousetrap_line_grammar.json',
  contract: 'data/canonical-production-contract.json',
  manifest: 'data/canonical-integration-manifest.json',
  assembler: 'app/scripts/assemble-production.mjs',
  patch: 'data/final-quarter-vocabulary-patch.json',
  patchCompressed: 'data/final-quarter-vocabulary-patch.json.gz.b64',
  report: 'data/final-quarter-vocabulary-qa.json'
};

if (!fs.existsSync(abs(FILES.patch))) {
  const encoded = fs.readFileSync(abs(FILES.patchCompressed), 'utf8').trim();
  if (!encoded) fail('Compressed patch payload is empty');
  const expanded = zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
  const parsed = JSON.parse(expanded);
  if (parsed?.schemaVersion !== 1) fail('Decoded patch schema invalid');
  fs.writeFileSync(abs(FILES.patch), expanded.endsWith('\n') ? expanded : expanded + '\n');
}

const patch = readJson(FILES.patch);
if (patch.schemaVersion !== 1) fail('Patch schemaVersion must be 1');
const scope = patch.scope || {};
if (scope.sceneId !== 'act2' || scope.firstSpeech !== 348 || scope.lastSpeech !== 638 || scope.speechCount !== 291) fail('Unexpected patch scope');
if (JSON.stringify(scope.globalSpeechRange) !== JSON.stringify([874, 1164])) fail('Unexpected global speech range');
if (scope.pdfAudit?.endingInstruction !== 'QUICK CURTAIN') fail('Ending instruction audit missing');
if (scope.pdfAudit?.stageDirectionChunksReviewed !== 178) fail('Stage-direction source audit count mismatch');
if (!Array.isArray(patch.lineRules) || patch.lineRules.length !== 207) fail('Unexpected line rule count');
if (!Array.isArray(patch.dictionaryOnly) || patch.dictionaryOnly.length !== 47) fail('Unexpected dictionary-only count');

const script = readJson(FILES.script);
const vocabulary = readJson(FILES.vocabulary);
const dictionary = readJson(FILES.dictionary);
const beforeVocabulary = JSON.parse(JSON.stringify(vocabulary));
const beforeHashes = {
  script: sha256(FILES.script),
  translations: sha256(FILES.translations),
  grammar: sha256(FILES.grammar)
};

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
if (allSpeechIds.length !== 1164 || new Set(allSpeechIds).size !== 1164) fail('Canonical speech ID coverage invalid');
const allSpeechIdSet = new Set(allSpeechIds);
const targetSpeeches = script.act2.speeches.slice(347, 638);
if (targetSpeeches.length !== 291 || targetSpeeches[0]?.id !== 'act2-speech-0348' || targetSpeeches.at(-1)?.id !== 'act2-speech-0638') fail('Target extraction failed');
const targetIds = new Set(targetSpeeches.map(x => x.id));
for (const id of allSpeechIds) if (!Array.isArray(vocabulary[id])) fail(`Vocabulary missing canonical speech key: ${id}`);
for (const id of Object.keys(vocabulary)) if (!allSpeechIdSet.has(id)) fail(`Invalid vocabulary Speech ID: ${id}`);

const stats = {
  reviewedSpeeches: 291,
  lineRules: patch.lineRules.length,
  matchedRules: 0,
  ruleMatches: 0,
  newVocabularyItems: 0,
  updatedVocabularyItems: 0,
  newDictionaryEntries: 0,
  improvedDictionaryEntries: 0,
  metadataEnrichedDictionaryEntries: 0,
  outOfScopeMeaningSyncs: 0,
  inThisPlayAdditions: 0,
  inThisPlayImprovements: 0,
  properNouns: patch.lineRules.filter(x => x.category === 'proper').length,
  multiWordExpressions: patch.lineRules.filter(x => ['phrase', 'formula'].includes(x.category)).length,
  stageDirectionVocabulary: patch.dictionaryOnly.filter(x => x.category === 'stage-direction').length,
  stageDirectionDictionaryNewOrImproved: 0
};

const dictKeyByNorm = new Map();
for (const key of Object.keys(dictionary)) {
  const n = norm(key);
  if (!n) fail(`Empty dictionary key: ${key}`);
  if (dictKeyByNorm.has(n)) fail(`Dictionary normalized-key duplicate: ${key} / ${dictKeyByNorm.get(n)}`);
  dictKeyByNorm.set(n, key);
}
const changedMeaningNorms = new Set();
const changedDictionaryNorms = new Set();

function ensureDictionary(lemma, spec, { improve = false, stage = false } = {}) {
  const n = norm(lemma);
  if (!n) fail('Empty dictionary lemma');
  let key = dictKeyByNorm.get(n);
  const proposedMeaning = String(spec?.meaning || '').trim();
  const proposedPos = String(spec?.pos || '').trim();
  const proposedTags = mergeTags(spec?.tags);
  if (!key) {
    if (!proposedMeaning) fail(`Missing dictionary meaning for new lemma: ${lemma}`);
    key = lemma;
    dictionary[key] = {
      lemma: String(lemma).trim(),
      pos: proposedPos || '未分類',
      coreMeaning: proposedMeaning,
      tags: proposedTags,
      meaning: proposedMeaning
    };
    dictKeyByNorm.set(n, key);
    changedDictionaryNorms.add(n);
    changedMeaningNorms.add(n);
    stats.newDictionaryEntries += 1;
    if (stage) stats.stageDirectionDictionaryNewOrImproved += 1;
    return dictionary[key];
  }

  const entry = dictionary[key];
  if (!entry || typeof entry !== 'object') fail(`Invalid dictionary entry: ${key}`);
  let semanticChanged = false;
  let metadataChanged = false;
  const currentMeaning = String(entry.meaning || entry.coreMeaning || '').trim();
  if (!currentMeaning) fail(`Existing dictionary entry has no meaning: ${key}`);

  if (improve && proposedMeaning && proposedMeaning !== currentMeaning) {
    entry.meaning = proposedMeaning;
    entry.coreMeaning = proposedMeaning;
    semanticChanged = true;
  } else {
    entry.meaning = currentMeaning;
    entry.coreMeaning = currentMeaning;
  }
  if (!String(entry.lemma || '').trim()) { entry.lemma = String(lemma).trim(); metadataChanged = true; }
  if (improve && proposedPos && proposedPos !== String(entry.pos || '').trim()) { entry.pos = proposedPos; metadataChanged = true; }
  else if (!String(entry.pos || '').trim() && proposedPos) { entry.pos = proposedPos; metadataChanged = true; }
  const tags = mergeTags(entry.tags, proposedTags);
  if (JSON.stringify(tags) !== JSON.stringify(Array.isArray(entry.tags) ? entry.tags : [])) { entry.tags = tags; metadataChanged = true; }
  if (!Array.isArray(entry.tags)) entry.tags = [];

  if (semanticChanged) {
    changedDictionaryNorms.add(n);
    changedMeaningNorms.add(n);
    stats.improvedDictionaryEntries += 1;
    if (stage) stats.stageDirectionDictionaryNewOrImproved += 1;
  } else if (metadataChanged) {
    changedDictionaryNorms.add(n);
    stats.metadataEnrichedDictionaryEntries += 1;
    if (stage) stats.stageDirectionDictionaryNewOrImproved += 1;
  }
  return entry;
}

const ruleIdentity = new Set();
for (const rule of patch.lineRules) {
  const surface = String(rule?.surface || '').trim();
  const lemma = String(rule?.lemma || '').trim();
  if (!surface || !lemma) fail('Patch rule missing surface/lemma');
  const identity = `${norm(surface)}\u0000${norm(lemma)}`;
  if (ruleIdentity.has(identity)) fail(`Duplicate patch rule: ${surface} / ${lemma}`);
  ruleIdentity.add(identity);

  const dictEntry = ensureDictionary(lemma, rule.dictionary || {}, { improve: rule.improveDictionary === true });
  const finalMeaning = String(dictEntry.meaning || '').trim();
  const matches = targetSpeeches.filter(speech => norm(speech.text).includes(norm(surface)));
  const expectedMin = Number.isInteger(rule.expectedMin) ? rule.expectedMin : 1;
  if (matches.length < expectedMin) fail(`Patch rule match count below expected minimum (${matches.length} < ${expectedMin}): ${surface} / ${lemma}`);
  stats.matchedRules += 1;
  stats.ruleMatches += matches.length;

  for (const speech of matches) {
    const rows = vocabulary[speech.id];
    const existing = rows.find(item => norm(item?.surface) === norm(surface) && norm(item?.lemma) === norm(lemma));
    const playMeaning = typeof rule.playMeaning === 'boolean' ? rule.playMeaning : true;
    const inThisPlay = String(rule.inThisPlay || '').trim();
    if (existing) {
      let changed = false;
      if (String(existing.meaning || '').trim() !== finalMeaning) { existing.meaning = finalMeaning; changed = true; }
      if (existing.playMeaning !== playMeaning) { existing.playMeaning = playMeaning; changed = true; }
      if (inThisPlay) {
        const old = String(existing.inThisPlay || '').trim();
        if (!old) { existing.inThisPlay = inThisPlay; stats.inThisPlayAdditions += 1; changed = true; }
        else if (old !== inThisPlay && inThisPlay.length > old.length) { existing.inThisPlay = inThisPlay; stats.inThisPlayImprovements += 1; changed = true; }
      }
      if (changed) stats.updatedVocabularyItems += 1;
    } else {
      const entry = { surface, lemma, meaning: finalMeaning, playMeaning };
      if (inThisPlay) { entry.inThisPlay = inThisPlay; stats.inThisPlayAdditions += 1; }
      rows.push(entry);
      stats.newVocabularyItems += 1;
    }
  }
}

for (const item of patch.dictionaryOnly) {
  const lemma = String(item?.lemma || '').trim();
  if (!lemma) fail('dictionaryOnly item missing lemma');
  ensureDictionary(lemma, item.dictionary || {}, { improve: item.improveDictionary === true, stage: item.category === 'stage-direction' });
}

// If a dictionary meaning changes, synchronize every line association for that lemma across the play.
for (const [speechId, rows] of Object.entries(vocabulary)) {
  for (const item of rows) {
    const n = norm(item?.lemma);
    if (!changedMeaningNorms.has(n)) continue;
    const key = dictKeyByNorm.get(n);
    if (!key) fail(`Changed dictionary lemma disappeared: ${item?.lemma}`);
    const finalMeaning = String(dictionary[key]?.meaning || '').trim();
    if (String(item?.meaning || '').trim() !== finalMeaning) {
      item.meaning = finalMeaning;
      if (!targetIds.has(speechId)) stats.outOfScopeMeaningSyncs += 1;
    }
  }
}

writeJson(FILES.vocabulary, vocabulary);
writeJson(FILES.dictionary, dictionary);

// Whole-production structural QA.
const dictionaryByNorm = new Map(Object.entries(dictionary).map(([key, entry]) => [norm(key), entry]));
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
    if (seen.has(pair)) fail(`Duplicate vocabulary pair: ${id} / ${surface} / ${lemma}`);
    seen.add(pair);
    const dict = dictionaryByNorm.get(norm(lemma));
    if (!dict) fail(`Missing dictionary reference: ${id} / ${lemma}`);
    if (String(dict.meaning || '').trim() !== meaning) fail(`Vocabulary/dictionary meaning mismatch: ${id} / ${lemma}`);
    if (Object.prototype.hasOwnProperty.call(item, 'inThisPlay')) {
      const text = String(item.inThisPlay || '').trim();
      if (!text || text.length > 360 || text === meaning) fail(`Invalid inThisPlay: ${id} / ${lemma}`);
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
  if (!meaning || !coreMeaning || meaning !== coreMeaning) fail(`Invalid dictionary meaning/coreMeaning: ${key}`);
  if (Object.prototype.hasOwnProperty.call(entry, 'contextMeaning') || Object.prototype.hasOwnProperty.call(entry, 'contextExplanation')) fail(`Context field forbidden in dictionary: ${key}`);
  if (Object.prototype.hasOwnProperty.call(entry, 'pattern') || Object.prototype.hasOwnProperty.call(entry, 'patternDesc')) fail(`Pattern field forbidden in dictionary: ${key}`);
}

// Out-of-scope line associations may only change in meaning when a shared dictionary lemma was deliberately improved.
for (const id of allSpeechIds) {
  if (targetIds.has(id)) continue;
  const before = beforeVocabulary[id];
  const after = vocabulary[id];
  if (!Array.isArray(before) || before.length !== after.length) fail(`Out-of-scope vocabulary structure changed: ${id}`);
  for (let i = 0; i < before.length; i += 1) {
    const a = { ...before[i] }, b = { ...after[i] };
    const oldMeaning = a.meaning, newMeaning = b.meaning;
    delete a.meaning; delete b.meaning;
    if (JSON.stringify(a) !== JSON.stringify(b)) fail(`Out-of-scope vocabulary association changed: ${id} / ${before[i]?.lemma}`);
    if (oldMeaning !== newMeaning && !changedMeaningNorms.has(norm(before[i]?.lemma))) fail(`Unexpected out-of-scope meaning change: ${id} / ${before[i]?.lemma}`);
  }
}

const afterHashes = { script: sha256(FILES.script), translations: sha256(FILES.translations), grammar: sha256(FILES.grammar) };
if (JSON.stringify(beforeHashes) !== JSON.stringify(afterHashes)) fail('Unrelated canonical source data changed');

// Refresh canonical SHA contract.
const contract = readJson(FILES.contract);
if (contract.schemaVersion !== 1 || !Array.isArray(contract.files) || contract.files.length !== 5) fail('Canonical production contract schema invalid');
const canonicalPaths = [FILES.script, FILES.translations, FILES.vocabulary, FILES.grammar, FILES.dictionary];
const contractByPath = new Map(contract.files.map(item => [item.path, item]));
for (const p of canonicalPaths) {
  const item = contractByPath.get(p);
  if (!item) fail(`Canonical contract missing path: ${p}`);
  item.sha256 = sha256(p);
}
writeJson(FILES.contract, contract);

// Refresh integration metadata while preserving unrelated fields.
const manifest = readJson(FILES.manifest);
if (manifest.script) manifest.script.sha256 = sha256(FILES.script);
if (manifest.studyAssets?.translations) manifest.studyAssets.translations.sha256 = sha256(FILES.translations);
if (manifest.studyAssets?.lineGrammar) manifest.studyAssets.lineGrammar.sha256 = sha256(FILES.grammar);
if (manifest.studyAssets?.lineVocabulary) {
  Object.assign(manifest.studyAssets.lineVocabulary, {
    sha256: sha256(FILES.vocabulary),
    coverageSpeechIds: 1164,
    items: vocabItems,
    annotatedSpeeches,
    playMeaningItems,
    neutralOnlyItems,
    inThisPlayItems
  });
}
if (manifest.studyAssets?.wordDictionary) {
  Object.assign(manifest.studyAssets.wordDictionary, {
    sha256: sha256(FILES.dictionary),
    entries: Object.keys(dictionary).length,
    referencedLemmas: referencedLemmas.size
  });
}
writeJson(FILES.manifest, manifest);

// The production verifier intentionally pins exact display counts; update only those two generated invariants.
let assembler = fs.readFileSync(abs(FILES.assembler), 'utf8');
const countPattern = /if\(vocabularyDisplayed!==\d+\|\|vocabularyNeutralOnly!==\d+\)fail\(`vocabulary presentation counts invalid \(\$\{vocabularyDisplayed\}\/\$\{vocabularyNeutralOnly\}\)`\);/;
if (!countPattern.test(assembler)) fail('Unable to locate assembler vocabulary count invariant');
assembler = assembler.replace(countPattern, `if(vocabularyDisplayed!==${playMeaningItems}||vocabularyNeutralOnly!==${neutralOnlyItems})fail(\`vocabulary presentation counts invalid (\${vocabularyDisplayed}/\${vocabularyNeutralOnly})\`);`);
fs.writeFileSync(abs(FILES.assembler), assembler);

const verifyOutput = execFileSync(process.execPath, ['scripts/assemble-production.mjs', '--verify-only'], {
  cwd: abs('app'),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
}).trim();
const verifyJson = JSON.parse(verifyOutput);
if (verifyJson.status !== 'PASS') fail(`Production verifier failed: ${verifyOutput}`);

const report = {
  schemaVersion: 1,
  patchId: patch.patchId,
  status: 'PASS',
  scope,
  stats,
  final: {
    vocabularyItems: vocabItems,
    playMeaningItems,
    neutralOnlyItems,
    annotatedSpeeches,
    inThisPlayItems,
    dictionaryEntries: Object.keys(dictionary).length,
    referencedDictionaryLemmas: referencedLemmas.size
  },
  qa: {
    targetSpeechCount: 'PASS',
    firstSpeech: 'act2-speech-0348',
    lastSpeech: 'act2-speech-0638',
    endingInstruction: scope.pdfAudit.endingInstruction,
    stageDirectionChunksReviewed: scope.pdfAudit.stageDirectionChunksReviewed,
    jsonStructuralValidation: 'PASS',
    duplicateVocabularyPairs: 0,
    missingDictionaryReferences: 0,
    invalidSpeechIds: 0,
    dictionaryMeaningConsistency: 'PASS',
    inThisPlayContract: 'PASS',
    productionContract: 'PASS',
    unrelatedCanonicalSourceChanged: false,
    outOfScopeAssociationChanges: 0,
    outOfScopeMeaningSyncs: stats.outOfScopeMeaningSyncs,
    crossPlayDictionaryConsistency: 'PASS'
  },
  changedDictionaryLemmas: [...changedDictionaryNorms].sort(),
  research: patch.research || [],
  productionVerifier: verifyJson
};
writeJson(FILES.report, report);

// Recheck canonical hashes after report creation.
for (const item of contract.files) if (sha256(item.path) !== item.sha256) fail(`Post-QA canonical SHA mismatch: ${item.path}`);
console.log(JSON.stringify(report, null, 2));
