import fs from 'node:fs';

const blockId = process.argv[2] || 'block-1';
const configs = {
  'block-1': { sceneId: 'act1-scene1', first: 1, last: 190 },
  'block-2': { sceneId: 'act1-scene2', first: 1, last: 178 },
  'block-3': { sceneId: 'act1-scene2', first: 179, last: 336 },
  'block-4': { sceneId: 'act2', first: 1, last: 179 },
  'block-5': { sceneId: 'act2', first: 180, last: 423 }
};
const config = configs[blockId];
if (!config) throw new Error(`Unsupported block: ${blockId}`);

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const script = read('mousetrap_script_data.json');
const outline = read('data/mousetrap_context_outline.json');
const contextual = read(`data/vocabulary-rebuild/${blockId}-line-vocabulary.json`);
const threshold = read(`data/vocabulary-rebuild/${blockId}-b1plus-coverage.json`);
const dictionary = read(`data/vocabulary-rebuild/${blockId}-dictionary.json`);
const supplement = read(`data/vocabulary-rebuild/${blockId}-dictionary-supplement.json`);

const errors = [];
const warnings = [];
const { sceneId, first, last } = config;
const allSceneSpeeches = script?.[sceneId]?.speeches;
const speeches = Array.isArray(allSceneSpeeches) ? allSceneSpeeches.slice(first - 1, last) : null;
const expectedCount = last - first + 1;
if (!Array.isArray(speeches) || speeches.length !== expectedCount) {
  errors.push(`script.${sceneId}.speech range expected ${expectedCount}, got ${speeches?.length ?? 'missing'}`);
}

if (outline?.outlines?.[blockId]?.status !== 'outline-complete') {
  errors.push(`${blockId} outline is not marked outline-complete`);
}
if (outline?.outlines?.[blockId]?.scope?.speechCount !== expectedCount) {
  errors.push(`${blockId} outline speechCount is not ${expectedCount}`);
}
if (contextual?.processedSpeechCount !== expectedCount || contextual?.processedSpeechRange?.[0] !== first || contextual?.processedSpeechRange?.[1] !== last) {
  errors.push(`Context-first vocabulary processed range is not ${first}..${last}`);
}

const expectedIds = new Set((speeches || []).map(s => s.id));
const speechById = new Map((speeches || []).map(s => [s.id, s]));

const dictA = dictionary?.entries || {};
const dictB = supplement?.entries || {};
for (const lemma of Object.keys(dictB)) {
  if (Object.prototype.hasOwnProperty.call(dictA, lemma)) errors.push(`Dictionary lemma duplicated across base/supplement: ${lemma}`);
}
const mergedDictionary = { ...dictA, ...dictB };
for (const [lemma, entry] of Object.entries(mergedDictionary)) {
  if (!String(entry?.meaning || '').trim()) errors.push(`Dictionary meaning missing: ${lemma}`);
  if (Object.prototype.hasOwnProperty.call(entry || {}, 'contextMeaning')) errors.push(`Context-specific field leaked into neutral dictionary: ${lemma}`);
}

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[‘’“”"']/g, '')
    .replace(/[‐‑‒–—―-]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

let contextualEntries = 0;
let nonEmptyContextMeanings = 0;
let thresholdEntries = 0;
const selectedLemmas = new Set();
const contextLemmas = new Set();
const perSpeechPairs = new Set();

function inspectLines(lines, source, requireBlankContext) {
  for (const [speechId, entries] of Object.entries(lines || {})) {
    if (!expectedIds.has(speechId)) {
      errors.push(`${source}: invalid speech id ${speechId}`);
      continue;
    }
    if (!Array.isArray(entries)) {
      errors.push(`${source}: entries must be array for ${speechId}`);
      continue;
    }
    const speechNorm = norm(speechById.get(speechId)?.text);
    for (const item of entries) {
      const surface = String(item?.surface || '').trim();
      const lemma = String(item?.lemma || '').trim();
      const contextMeaning = String(item?.contextMeaning || '').trim();
      if (!surface || !lemma) errors.push(`${source}: surface/lemma missing at ${speechId}`);
      if (requireBlankContext && contextMeaning) errors.push(`${source}: contextMeaning must be blank at ${speechId} / ${surface}`);
      if (source === 'context') {
        contextualEntries += 1;
        if (contextMeaning) {
          nonEmptyContextMeanings += 1;
          contextLemmas.add(lemma);
        }
      } else {
        thresholdEntries += 1;
      }
      selectedLemmas.add(lemma);
      if (!mergedDictionary[lemma]) errors.push(`Dictionary entry missing for lemma: ${lemma} (${speechId})`);
      const pairKey = `${speechId}\u0000${norm(surface)}\u0000${lemma}`;
      if (perSpeechPairs.has(pairKey)) errors.push(`Duplicate selected entry: ${speechId} / ${surface} / ${lemma}`);
      perSpeechPairs.add(pairKey);

      const surfaceNorm = norm(surface);
      if (surfaceNorm && speechNorm && !speechNorm.includes(surfaceNorm)) {
        warnings.push(`Surface not exact normalized substring: ${speechId} / ${surface}`);
      }
    }
  }
}

inspectLines(contextual?.lines, 'context', false);
inspectLines(threshold?.lines, 'b1plus', true);

if (!contextualEntries) errors.push('No context-first vocabulary entries found');
if (!nonEmptyContextMeanings) errors.push('No non-empty context meanings found');
if (!thresholdEntries) errors.push('No B1+ threshold additions found');

const report = {
  result: errors.length ? 'FAIL' : 'PASS',
  blockId,
  sceneId,
  speechRange: [first, last],
  speeches: speeches?.length ?? 0,
  contextualEntries,
  nonEmptyContextMeanings,
  thresholdEntries,
  selectedUniqueLemmas: selectedLemmas.size,
  contextUniqueLemmas: contextLemmas.size,
  dictionaryBaseEntries: Object.keys(dictA).length,
  dictionarySupplementEntries: Object.keys(dictB).length,
  dictionaryMergedEntries: Object.keys(mergedDictionary).length,
  errors,
  warnings
};

console.log(JSON.stringify(report, null, 2));
if (errors.length || warnings.length) process.exit(1);
