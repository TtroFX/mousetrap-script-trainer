import fs from 'node:fs';

const blockId = process.argv[2] || 'block-1';
if (blockId !== 'block-1') throw new Error(`Unsupported block: ${blockId}`);

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const script = read('mousetrap_script_data.json');
const outline = read('data/mousetrap_context_outline.json');
const contextual = read('data/vocabulary-rebuild/block-1-line-vocabulary.json');
const threshold = read('data/vocabulary-rebuild/block-1-b1plus-coverage.json');
const dictionary = read('data/vocabulary-rebuild/block-1-dictionary.json');
const supplement = read('data/vocabulary-rebuild/block-1-dictionary-supplement.json');

const errors = [];
const warnings = [];
const sceneId = 'act1-scene1';
const speeches = script?.[sceneId]?.speeches;
if (!Array.isArray(speeches) || speeches.length !== 190) {
  errors.push(`script.${sceneId}.speeches expected 190, got ${speeches?.length ?? 'missing'}`);
}

if (outline?.outlines?.['block-1']?.status !== 'outline-complete') {
  errors.push('Block 1 outline is not marked outline-complete');
}
if (outline?.outlines?.['block-1']?.scope?.speechCount !== 190) {
  errors.push('Block 1 outline speechCount is not 190');
}
if (contextual?.processedSpeechCount !== 190 || contextual?.processedSpeechRange?.[0] !== 1 || contextual?.processedSpeechRange?.[1] !== 190) {
  errors.push('Context-first vocabulary processed range is not 1..190');
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
if (errors.length) process.exit(1);
