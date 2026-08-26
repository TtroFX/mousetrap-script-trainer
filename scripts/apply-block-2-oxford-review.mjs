import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const script = read('mousetrap_script_data.json');
const review = read('data/vocabulary-rebuild/block-2-oxford-review.json');
const contextPath = 'data/vocabulary-rebuild/block-2-line-vocabulary.json';
const thresholdPath = 'data/vocabulary-rebuild/block-2-b1plus-coverage.json';
const dictionaryPath = 'data/vocabulary-rebuild/block-2-dictionary.json';
const supplementPath = 'data/vocabulary-rebuild/block-2-dictionary-supplement.json';
const context = read(contextPath);
const threshold = read(thresholdPath);
const dictionary = read(dictionaryPath);
const supplement = read(supplementPath);
const speeches = script['act1-scene2'].speeches.slice(0, 178);
const speechById = new Map(speeches.map(s => [s.id, s]));

const norm = s => String(s || '').toLowerCase().normalize('NFKC').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function arraysForSpeech(speechId) {
  return [context.lines[speechId] ||= [], threshold.lines[speechId] ||= []];
}
function allEntriesForSpeech(speechId) {
  const [a,b] = arraysForSpeech(speechId);
  return [...a, ...b];
}
function findExact(speechId, surface) {
  const target = norm(surface);
  for (const arr of arraysForSpeech(speechId)) {
    const item = arr.find(x => norm(x.surface) === target);
    if (item) return item;
  }
  return null;
}
function ensureDictionary(lemma, neutral) {
  if (!neutral?.meaning) throw new Error(`Neutral meaning missing for ${lemma}`);
  dictionary.entries[lemma] = {
    pos: neutral.pos || '未分類',
    meaning: neutral.meaning,
    ...(neutral.tags?.length ? { tags: neutral.tags } : {})
  };
}
function addThreshold(speechId, surface, lemma) {
  const existing = findExact(speechId, surface);
  if (existing) {
    existing.lemma = lemma;
    return existing;
  }
  const sameLemma = allEntriesForSpeech(speechId).find(x => x.lemma === lemma && norm(x.surface).includes(norm(surface)));
  if (sameLemma) return sameLemma;
  const item = { surface, lemma, contextMeaning: '' };
  threshold.lines[speechId].push(item);
  return item;
}
function addContextPhrase(entry) {
  const { speechId, surface, lemma, contextMeaning = '', neutral } = entry;
  ensureDictionary(lemma, neutral);
  let item = findExact(speechId, surface);
  if (!item) {
    const sameLemma = allEntriesForSpeech(speechId).find(x => x.lemma === lemma);
    if (sameLemma && !contextMeaning) return sameLemma;
    item = { surface, lemma, contextMeaning };
    context.lines[speechId] ||= [];
    context.lines[speechId].push(item);
  } else {
    item.lemma = lemma;
    if (contextMeaning) item.contextMeaning = contextMeaning;
  }
  return item;
}
function resolvePhraseSpeechId(phrase) {
  const target = norm(phrase.surface);
  const declared = speechById.get(phrase.speechId);
  if (declared && norm(declared.text).includes(target)) return phrase.speechId;
  const matches = speeches.filter(s => norm(s.text).includes(target));
  if (matches.length === 1) return matches[0].id;
  throw new Error(`Cannot resolve reviewed phrase to exactly one speech: ${phrase.speechId} / ${phrase.surface} / matches=${matches.map(x => x.id).join(',')}`);
}

let lexicalAdds = 0;
let lexicalUpdates = 0;
for (const lex of review.includeLexemes || []) {
  ensureDictionary(lex.lemma, lex);
  for (const speech of speeches) {
    for (const form of lex.forms || [lex.word]) {
      const re = new RegExp(`(^|[^A-Za-z])(${escapeRe(form)})(?=$|[^A-Za-z])`, 'i');
      const match = speech.text.match(re);
      if (!match) continue;
      const actualSurface = match[2];
      const before = findExact(speech.id, actualSurface);
      addThreshold(speech.id, actualSurface, lex.lemma);
      if (before) lexicalUpdates += 1; else lexicalAdds += 1;
    }
  }
}

let phraseAdds = 0;
let phraseRelinks = 0;
for (const phrase of review.includePhrases || []) {
  const resolvedSpeechId = resolvePhraseSpeechId(phrase);
  if (resolvedSpeechId !== phrase.speechId) phraseRelinks += 1;
  const resolved = { ...phrase, speechId: resolvedSpeechId };
  const before = findExact(resolvedSpeechId, resolved.surface);
  addContextPhrase(resolved);
  if (!before) phraseAdds += 1;
}

// Remove empty arrays introduced only for lookup.
for (const source of [context.lines, threshold.lines]) {
  for (const [speechId, entries] of Object.entries(source)) if (!entries.length) delete source[speechId];
}

// Keep the neutral dictionary exactly aligned to selected lemmas after review.
const selected = new Set();
for (const source of [context.lines, threshold.lines]) {
  for (const entries of Object.values(source)) for (const entry of entries) selected.add(entry.lemma);
}
for (const lemma of [...selected]) {
  if (!dictionary.entries[lemma] && supplement.entries?.[lemma]) dictionary.entries[lemma] = supplement.entries[lemma];
  if (!dictionary.entries[lemma]) throw new Error(`Dictionary entry missing after Oxford review: ${lemma}`);
}
for (const lemma of Object.keys(dictionary.entries)) if (!selected.has(lemma)) delete dictionary.entries[lemma];
supplement.entries = {};

write(contextPath, context);
write(thresholdPath, threshold);
write(dictionaryPath, dictionary);
write(supplementPath, supplement);
console.log(JSON.stringify({ lexicalAdds, lexicalUpdates, phraseAdds, phraseRelinks, selectedLemmas: selected.size, dictionaryEntries: Object.keys(dictionary.entries).length }, null, 2));
