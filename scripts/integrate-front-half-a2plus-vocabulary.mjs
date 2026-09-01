import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const abs = p => path.join(ROOT, p);
const readJson = p => JSON.parse(fs.readFileSync(abs(p), 'utf8'));
const writeJson = (p, v) => fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + '\n');
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(abs(p))).digest('hex');
const norm = s => String(s ?? '').toLowerCase().normalize('NFKC').replace(/[‘’]/g, "'").trim();
const fail = msg => { throw new Error(msg); };

const FILES = {
  script: 'mousetrap_script_data.json',
  vocabulary: 'mousetrap_line_vocabulary.json',
  dictionary: 'mousetrap_word_dictionary.json',
  translations: 'mousetrap_line_translations.json',
  grammar: 'mousetrap_line_grammar.json',
  contract: 'data/canonical-production-contract.json',
  manifest: 'data/canonical-integration-manifest.json',
  sourceAudit: 'data/a2plus-front-half-integration/source-audit.json',
  candidate: 'data/a2plus-candidate-lists/part-01-02-unique.txt',
  policy: 'data/a2plus-front-half-integration/review-policy.json',
  report: 'data/a2plus-front-half-integration/integration-qa.json'
};
const definitionFiles = [1,2,3,4].map(n => `data/a2plus-front-half-integration/definitions-0${n}.json`);

const script = readJson(FILES.script);
const vocabulary = readJson(FILES.vocabulary);
let dictionary = readJson(FILES.dictionary);
const sourceAudit = readJson(FILES.sourceAudit);
const policy = readJson(FILES.policy);
const definitions = {};
for (const p of definitionFiles) {
  for (const [lemma, spec] of Object.entries(readJson(p))) {
    if (definitions[lemma]) fail(`Duplicate curated definition: ${lemma}`);
    definitions[lemma] = spec;
  }
}

const allSpeeches = [...script['act1-scene1'].speeches, ...script['act1-scene2'].speeches, ...script.act2.speeches];
if (allSpeeches.length !== 1164) fail(`Expected 1164 speeches, got ${allSpeeches.length}`);
const targetSpeeches = allSpeeches.slice(0, 582);
const targetIds = new Set(targetSpeeches.map(s => s.id));
if (targetSpeeches[0]?.id !== 'act1-scene1-speech-0001' || targetSpeeches.at(-1)?.id !== 'act2-speech-0056' || allSpeeches[582]?.id !== 'act2-speech-0057') fail('Front-half boundary mismatch');

const candidateLines = fs.readFileSync(abs(FILES.candidate), 'utf8').split(/\r?\n/);
const hi = candidateLines.findIndex(x => x.startsWith('word\tcefr\tparts\t'));
if (hi < 0) fail('Candidate header missing');
const candidateRows = candidateLines.slice(hi + 1).filter(Boolean).map(line => {
  const [word, cefr, parts, occurrences, firstSpeechId, surfaceForms, allOxfordLevels] = line.split('\t');
  return { word:norm(word), cefr, parts, occurrences:Number(occurrences), firstSpeechId, surfaceForms, allOxfordLevels };
});
if (candidateRows.length !== 297) fail(`Expected 297 candidate rows, got ${candidateRows.length}`);
const candidateByWord = new Map(candidateRows.map(r => [r.word, r]));

const excludedPure = new Set(Object.keys(policy.excludeFromPureA2Plus || {}).map(norm));
const restoreMixed = new Set(Object.keys(policy.restoreFromMixedA1A2Plus || {}).map(norm));
const selected = new Set();
for (const row of sourceAudit.rows || []) {
  const lemma = norm(row.word);
  if (row.disposition === 'include' && !excludedPure.has(lemma)) selected.add(lemma);
}
for (const lemma of restoreMixed) selected.add(lemma);
if (selected.size !== 179) fail(`Expected 179 reviewed lemmas, got ${selected.size}`);
const definitionKeys = new Set(Object.keys(definitions).map(norm));
const missingDefs = [...selected].filter(x => !definitionKeys.has(x));
const extraDefs = [...definitionKeys].filter(x => !selected.has(x));
if (missingDefs.length || extraDefs.length) fail(`Definition set mismatch; missing=${missingDefs.join(',')} extra=${extraDefs.join(',')}`);
for (const lemma of selected) if (!candidateByWord.has(lemma)) fail(`Selected lemma absent from candidate file: ${lemma}`);

// Normalize the few category labels whose source definitions intentionally use
// combined grammatical labels; production meaning headings stay one POS per heading.
const headingOverrides = {
  either: { pos:'代名詞・限定詞・副詞', meaning:'【代名詞】\n二つのうちどちらか。\n【限定詞】\n二つのうちどちらかの、どちらの～でも。\n【副詞】\n否定文で「～もまた（…ない）」。' },
  least: { pos:'限定詞・代名詞・副詞', meaning:'【限定詞】\n最も少ない、最小の。\n【代名詞】\n最も少ない量・もの。\n【副詞】\n最も少なく。' },
  less: { pos:'限定詞・代名詞・副詞', meaning:'【限定詞】\nより少ない。\n【代名詞】\nより少ない量・もの。\n【副詞】\nより少なく。' },
  several: { pos:'限定詞・代名詞', meaning:'【限定詞】\nいくつかの、数人の。\n【代名詞】\nいくつか、数人。' },
  sir: { pos:'名詞', meaning:'【名詞】\n男性への丁寧な呼びかけ「～さん」「～様」；英国の称号Sir。' }
};
for (const [lemma, override] of Object.entries(headingOverrides)) Object.assign(definitions[lemma], override);

const protectedHashes = { script:sha256(FILES.script), translations:sha256(FILES.translations), grammar:sha256(FILES.grammar) };
const before = {
  dictionaryEntries: Object.keys(dictionary).length,
  allVocabularyItems: Object.values(vocabulary).reduce((n, rows) => n + rows.length, 0),
  targetVocabularyItems: targetSpeeches.reduce((n, s) => n + (vocabulary[s.id] || []).length, 0)
};
const outOfScopeSnapshot = new Map(allSpeeches.slice(582).map(s => [s.id, JSON.stringify(vocabulary[s.id] || [])]));

const dictionaryByNorm = new Map(Object.keys(dictionary).map(k => [norm(k), k]));
let newDictionaryEntries = 0;
for (const lemma of [...selected].sort()) {
  const existingKey = dictionaryByNorm.get(lemma);
  if (existingKey) continue;
  const spec = definitions[lemma];
  const meaning = String(spec.meaning || '').trim();
  const pos = String(spec.pos || '').trim();
  if (!meaning || !pos || !meaning.startsWith('【')) fail(`Invalid curated definition: ${lemma}`);
  dictionary[lemma] = {
    lemma,
    pos,
    coreMeaning: meaning,
    tags: Array.isArray(spec.tags) ? [...new Set(spec.tags.map(String))] : [],
    meaning
  };
  dictionaryByNorm.set(lemma, lemma);
  newDictionaryEntries++;
}
// Keep canonical dictionary deterministic.
dictionary = Object.fromEntries(Object.entries(dictionary).sort(([a],[b]) => norm(a).localeCompare(norm(b), 'en')));

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function findSurface(text, surface) {
  const raw = String(text ?? '').replace(/[‘’]/g, "'");
  const wanted = String(surface ?? '').replace(/[‘’]/g, "'").trim();
  if (!wanted) return null;
  const re = new RegExp(`(^|[^A-Za-z])(${escapeRe(wanted)})(?=$|[^A-Za-z])`, 'i');
  const m = raw.match(re);
  return m ? m[2] : null;
}
function surfacesFor(lemma) {
  const override = policy.surfaceOverrides?.[lemma];
  if (Array.isArray(override) && override.length) return [...new Set(override.map(norm))];
  return [...new Set(String(candidateByWord.get(lemma)?.surfaceForms || '').split(',').map(norm).filter(Boolean))];
}
const selectedDetails = [];
let newVocabularyItems = 0;
let alreadyPresent = 0;
let exactSurfaceCoveredByOtherLemma = 0;
let matchedSpeechSurfaces = 0;
let inThisPlayAdded = 0;
const noSourceMatch = [];

for (const lemma of [...selected].sort()) {
  const dictKey = Object.keys(dictionary).find(k => norm(k) === lemma);
  const dictEntry = dictionary[dictKey];
  if (!dictEntry) fail(`Dictionary integration failed: ${lemma}`);
  const meaning = String(dictEntry.meaning || '').trim();
  const surfaces = surfacesFor(lemma);
  if (!surfaces.length) fail(`No surface forms for ${lemma}`);
  let lemmaMatches = 0;
  let lemmaAdds = 0;
  for (const surface of surfaces) {
    for (const speech of targetSpeeches) {
      const actual = findSurface(speech.text, surface);
      if (!actual) continue;
      lemmaMatches++;
      matchedSpeechSurfaces++;
      if (!Array.isArray(vocabulary[speech.id])) vocabulary[speech.id] = [];
      const rows = vocabulary[speech.id];
      const samePair = rows.find(x => norm(x.surface) === norm(actual) && norm(x.lemma) === lemma);
      if (samePair) { alreadyPresent++; continue; }
      const sameSurface = rows.find(x => norm(x.surface) === norm(actual));
      if (sameSurface) { exactSurfaceCoveredByOtherLemma++; continue; }
      const item = { surface:actual, lemma:dictKey, meaning, playMeaning:false };
      const context = String(policy.contextOverrides?.[lemma] || '').trim();
      if (context) { item.inThisPlay = context; item.playMeaning = true; inThisPlayAdded++; }
      rows.push(item);
      lemmaAdds++;
      newVocabularyItems++;
    }
  }
  if (!lemmaMatches) noSourceMatch.push({lemma,surfaces});
  selectedDetails.push({lemma,surfaces,matchedSpeechSurfaces:lemmaMatches,newVocabularyItems:lemmaAdds});
}
if (noSourceMatch.length) fail(`Selected lemmas without source match: ${JSON.stringify(noSourceMatch)}`);

// Re-sort each touched front-half row by its first textual occurrence, preserving
// stable order for entries that start at the same point.
for (const speech of targetSpeeches) {
  const rows = vocabulary[speech.id] || [];
  const text = norm(speech.text).replace(/[‘’]/g, "'");
  rows.forEach((row, i) => { row.__sortIndex = i; });
  rows.sort((a,b) => {
    const ai = text.indexOf(norm(a.surface));
    const bi = text.indexOf(norm(b.surface));
    const av = ai < 0 ? Number.MAX_SAFE_INTEGER : ai;
    const bv = bi < 0 ? Number.MAX_SAFE_INTEGER : bi;
    return av - bv || a.__sortIndex - b.__sortIndex;
  });
  rows.forEach(row => { delete row.__sortIndex; });
}

for (const [id, snapshot] of outOfScopeSnapshot) if (JSON.stringify(vocabulary[id] || []) !== snapshot) fail(`Out-of-scope vocabulary changed: ${id}`);
writeJson(FILES.dictionary, dictionary);
writeJson(FILES.vocabulary, vocabulary);

const allSpeechIds = allSpeeches.map(s => s.id);
const dictionaryByExactKeyAfter = new Map(Object.entries(dictionary).map(([k,v]) => [String(k).trim().toLowerCase(), v]));
let vocabItems=0, annotatedSpeeches=0, playMeaningItems=0, neutralOnlyItems=0, inThisPlayItems=0;
const referenced = new Set();
for (const id of allSpeechIds) {
  const rows = vocabulary[id] || [];
  if (rows.length) annotatedSpeeches++;
  const seen = new Set();
  for (const item of rows) {
    const surface = String(item?.surface || '').trim();
    const lemma = String(item?.lemma || '').trim();
    const meaning = String(item?.meaning || '').trim();
    if (!surface || !lemma || !meaning || typeof item.playMeaning !== 'boolean') fail(`Invalid vocabulary row ${id}`);
    const pair = `${norm(surface)}\0${norm(lemma)}`;
    if (seen.has(pair)) fail(`Duplicate pair ${id}/${surface}/${lemma}`);
    seen.add(pair);
    const de = dictionaryByExactKeyAfter.get(String(lemma).trim().toLowerCase());
    if (!de) fail(`Missing dictionary ref ${id}/${lemma}`);
    if (String(de.meaning || '').trim() !== meaning) fail(`Meaning mismatch ${id}/${lemma}`);
    if ('inThisPlay' in item) {
      const t=String(item.inThisPlay||'').trim();
      if (!t || t===meaning || t.length>360) fail(`Invalid inThisPlay ${id}/${lemma}`);
      inThisPlayItems++;
    }
    referenced.add(norm(lemma));
    vocabItems++;
    item.playMeaning ? playMeaningItems++ : neutralOnlyItems++;
  }
}
for (const [key, entry] of Object.entries(dictionary)) {
  if (!entry || typeof entry !== 'object' || !String(entry.pos||'').trim()) fail(`Invalid dictionary object ${key}`);
  if (!String(entry.meaning||'').trim() || String(entry.meaning).trim() !== String(entry.coreMeaning||'').trim()) fail(`Dictionary meaning/core mismatch ${key}`);
  if ('contextMeaning' in entry || 'contextExplanation' in entry || 'pattern' in entry || 'patternDesc' in entry) fail(`Context/pattern leak ${key}`);
}
const afterTargetVocabularyItems = targetSpeeches.reduce((n,s)=>n+(vocabulary[s.id]||[]).length,0);
if (vocabItems - before.allVocabularyItems !== newVocabularyItems) fail('Whole-play vocabulary delta mismatch');
if (afterTargetVocabularyItems - before.targetVocabularyItems !== newVocabularyItems) fail('Front-half vocabulary delta mismatch');
if (Object.keys(dictionary).length - before.dictionaryEntries !== newDictionaryEntries) fail('Dictionary delta mismatch');
const afterProtectedHashes = { script:sha256(FILES.script), translations:sha256(FILES.translations), grammar:sha256(FILES.grammar) };
if (JSON.stringify(protectedHashes) !== JSON.stringify(afterProtectedHashes)) fail('Protected canonical source changed');

const contract = readJson(FILES.contract);
const contractByPath = new Map(contract.files.map(x=>[x.path,x]));
for (const p of [FILES.script,FILES.translations,FILES.vocabulary,FILES.grammar,FILES.dictionary]) {
  const item=contractByPath.get(p); if(!item) fail(`Contract missing ${p}`); item.sha256=sha256(p);
}
writeJson(FILES.contract, contract);
const manifest = readJson(FILES.manifest);
if (manifest.studyAssets?.lineVocabulary) Object.assign(manifest.studyAssets.lineVocabulary, {sha256:sha256(FILES.vocabulary),coverageSpeechIds:1164,items:vocabItems,annotatedSpeeches,playMeaningItems,neutralOnlyItems,inThisPlayItems});
if (manifest.studyAssets?.wordDictionary) Object.assign(manifest.studyAssets.wordDictionary, {sha256:sha256(FILES.dictionary),entries:Object.keys(dictionary).length,referencedLemmas:referenced.size});
writeJson(FILES.manifest, manifest);

const semanticJson = JSON.parse(execFileSync(process.execPath,['scripts/validate-vocabulary-semantics.mjs'],{cwd:ROOT,encoding:'utf8'}).trim());
if (semanticJson.status !== 'PASS') fail('Semantic validator failed');
const styleScript = fs.existsSync(abs('scripts/audit-vocabulary-dictionary-style.mjs')) ? 'scripts/audit-vocabulary-dictionary-style.mjs' : null;
let styleJson = null;
if (styleScript) {
  const out = execFileSync(process.execPath,[styleScript],{cwd:ROOT,encoding:'utf8'}).trim();
  try { styleJson=JSON.parse(out); } catch { styleJson={raw:out}; }
  if (styleJson.status && styleJson.status !== 'PASS') fail('Dictionary style audit failed');
}
const productionJson = JSON.parse(execFileSync(process.execPath,['scripts/assemble-production.mjs','--verify-only'],{cwd:abs('app'),encoding:'utf8'}).trim());
if (productionJson.status !== 'PASS') fail('Production verifier failed');

const report = {
  schemaVersion:1,
  patchId:'front-half-a2plus-vocabulary-2026-09-02',
  status:'PASS',
  scope:{globalSpeechRange:[1,582],speechCount:582,first:targetSpeeches[0].id,last:targetSpeeches.at(-1).id,nextExcluded:allSpeeches[582].id},
  policy:policy.policy,
  review:{candidateCount:candidateRows.length,selectedLemmas:selected.size,pureCandidateExclusions:Object.keys(policy.excludeFromPureA2Plus||{}).length,restoredMixedLemmas:[...restoreMixed],otherMixedAndReviewedExclusions:candidateRows.length-selected.size-(Object.keys(policy.excludeFromPureA2Plus||{}).length)},
  before,
  stats:{newDictionaryEntries,newVocabularyItems,alreadyPresent,exactSurfaceCoveredByOtherLemma,matchedSpeechSurfaces,inThisPlayAdded},
  after:{dictionaryEntries:Object.keys(dictionary).length,allVocabularyItems:vocabItems,targetVocabularyItems:afterTargetVocabularyItems,annotatedSpeeches,playMeaningItems,neutralOnlyItems,inThisPlayItems,referencedDictionaryLemmas:referenced.size},
  qa:{candidateDefinitionReconciliation:'PASS',frontHalfBoundary:'PASS',sourceMatchForEverySelectedLemma:'PASS',outOfScopeLineMutationCheck:'PASS',duplicateVocabularyPairs:0,missingDictionaryReferences:0,dictionaryMeaningConsistency:'PASS',optionalInThisPlayContract:'PASS',semanticValidator:semanticJson,dictionaryStyleAudit:styleJson,productionVerifier:productionJson,protectedCanonicalSourcesUnchanged:true},
  selectedDetails,
  hashes:{vocabulary:sha256(FILES.vocabulary),dictionary:sha256(FILES.dictionary)}
};
writeJson(FILES.report, report);
for (const item of contract.files) if (sha256(item.path)!==item.sha256) fail(`Post-QA SHA mismatch ${item.path}`);
console.log(JSON.stringify(report,null,2));
