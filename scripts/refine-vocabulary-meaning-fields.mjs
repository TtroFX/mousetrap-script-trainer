import fs from 'node:fs';
import crypto from 'node:crypto';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const exists = p => fs.existsSync(p);

const VOCAB = 'mousetrap_line_vocabulary.json';
const DICT = 'mousetrap_word_dictionary.json';
const CONTRACT = 'data/canonical-production-contract.json';
const MANIFEST = 'data/canonical-integration-manifest.json';
const EXPANSION_REPORT = 'data/vocabulary-context-expansion-report.json';
const REPORT = 'data/vocabulary-meaning-refinement-report.json';

const vocab = read(VOCAB);
const dict = read(DICT);

const norm = s => String(s || '').toLowerCase().normalize('NFKC')
  .replace(/[‘’“”"']/g, '')
  .replace(/[‐‑‒–—―-]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();
const exactLemma = s => String(s || '').trim().toLowerCase();
const compact = s => String(s || '').normalize('NFKC').replace(/[\s。、，,:：;；!！?？「」『』“”‘’"']/g, '').toLowerCase();

function loadNeutralSources() {
  const neutral = new Map();
  const provenance = new Map();
  const dir = 'data/vocabulary-rebuild';
  const files = fs.readdirSync(dir)
    .filter(name => /block-\d+-(?:dictionary(?:-supplement)?|neutral-(?:seed|supplement))\.json$/.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'));

  for (const name of files) {
    const p = `${dir}/${name}`;
    const doc = read(p);
    for (const [lemma, entry] of Object.entries(doc.entries || {})) {
      const meaning = String(entry?.meaning || '').trim();
      if (!meaning) continue;
      const key = norm(lemma);
      if (!key) continue;
      const candidate = {
        lemma: String(lemma).trim(),
        pos: String(entry?.pos || '').trim(),
        meaning,
        tags: Array.isArray(entry?.tags) ? entry.tags : []
      };
      const existing = neutral.get(key);
      // Prefer the full block dictionary over supplements/seeds when both exist.
      const rank = /-dictionary\.json$/.test(name) ? 30 : /-dictionary-supplement\.json$/.test(name) ? 20 : 10;
      const prevRank = provenance.get(key)?.rank ?? -1;
      if (!existing || rank > prevRank) {
        neutral.set(key, candidate);
        provenance.set(key, { file: p, rank });
      }
    }
  }
  return { neutral, provenance, files };
}

function loadCuratedPlayMeanings() {
  const byExact = new Map();
  const conflicts = [];
  let sourceNonEmpty = 0;
  const files = [];
  for (let i = 1; i <= 6; i += 1) {
    const p = `data/vocabulary-rebuild/block-${i}-line-vocabulary.json`;
    if (!exists(p)) continue;
    files.push(p);
    const doc = read(p);
    for (const [speechId, rows] of Object.entries(doc.lines || {})) {
      for (const row of rows || []) {
        const inThisPlay = String(row?.contextMeaning || '').trim();
        if (!inThisPlay) continue;
        sourceNonEmpty += 1;
        const key = `${speechId}\u0000${norm(row.surface)}\u0000${norm(row.lemma)}`;
        const previous = byExact.get(key);
        if (previous && previous !== inThisPlay) conflicts.push({ speechId, surface: row.surface, lemma: row.lemma, previous, next: inThisPlay });
        byExact.set(key, inThisPlay);
      }
    }
  }
  if (conflicts.length) throw new Error(`conflicting curated contextMeaning entries: ${JSON.stringify(conflicts.slice(0, 5))}`);
  return { byExact, sourceNonEmpty, files };
}

function cleanNeutralMeaning(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/。{2,}/g, '。')
    .trim();
}

function singleLexicalItem(lemma) {
  const text = String(lemma || '').trim();
  return !!text && !/\s/.test(text);
}

function splitPos(pos) {
  const text = String(pos || '').trim();
  if (!text) return [];
  const parts = text.split('・').map(x => x.trim()).filter(Boolean);
  const known = new Set(['名詞','動詞','形容詞','副詞','前置詞','接続詞','間投詞','代名詞','限定詞','助動詞','固有名詞']);
  return parts.length > 1 && parts.every(x => known.has(x)) ? parts : [text];
}

function formatSenseBody(raw) {
  const text = cleanNeutralMeaning(raw);
  if (!text) return '';

  const slashParts = text.split(/\s*／\s*/).map(x => x.trim().replace(/。$/, '')).filter(Boolean);
  if (slashParts.length >= 2 && slashParts.length <= 4 && slashParts.every(x => x.length <= 45)) {
    return slashParts.map((x, i) => `${['①','②','③','④'][i]} ${x}`).join('\n');
  }

  const alsoParts = text.split(/。\s*また(?:、|は)?\s*/).map(x => x.trim().replace(/。$/, '')).filter(Boolean);
  if (alsoParts.length >= 2 && alsoParts.length <= 4 && alsoParts.every(x => x.length <= 60)) {
    return alsoParts.map((x, i) => `${['①','②','③','④'][i]} ${x}`).join('\n');
  }

  return text;
}

function formatDictionaryMeaning(lemma, pos, rawMeaning) {
  const raw = cleanNeutralMeaning(rawMeaning);
  if (!raw) return '';
  if (!singleLexicalItem(lemma)) return raw;

  const poses = splitPos(pos);
  const sentences = raw.split(/(?<=。)/u).map(x => x.trim()).filter(Boolean);
  if (poses.length > 1 && sentences.length === poses.length && poses.length <= 3) {
    return poses.map((p, i) => `【${p}】\n${formatSenseBody(sentences[i])}`).join('\n');
  }

  const heading = String(pos || '語句').trim() || '語句';
  return `【${heading}】\n${formatSenseBody(raw)}`;
}

const { neutral, provenance, files: neutralFiles } = loadNeutralSources();
const { byExact: playByExact, sourceNonEmpty, files: playFiles } = loadCuratedPlayMeanings();

let dictionarySourceExact = 0;
let dictionarySourceFallback = 0;
let dictionaryFormatted = 0;
const fallbackLemmas = [];

for (const [key, entry] of Object.entries(dict)) {
  const lemma = String(entry?.lemma || key).trim() || key;
  const source = neutral.get(norm(lemma)) || neutral.get(norm(key));
  let rawMeaning = String(source?.meaning || '').trim();
  let pos = String(source?.pos || entry?.pos || '').trim();

  if (rawMeaning) {
    dictionarySourceExact += 1;
    if (source?.pos && !String(entry.pos || '').trim()) entry.pos = source.pos;
    if (Array.isArray(source?.tags) && (!Array.isArray(entry.tags) || entry.tags.length === 0)) entry.tags = source.tags;
  } else {
    rawMeaning = String(entry?.meaning || entry?.contextMeaning || entry?.coreMeaning || '').trim();
    dictionarySourceFallback += 1;
    fallbackLemmas.push(lemma);
  }

  if (!rawMeaning) throw new Error(`no neutral dictionary meaning for ${lemma}`);
  const formatted = formatDictionaryMeaning(lemma, pos || entry?.pos, rawMeaning);
  if (!formatted) throw new Error(`empty formatted dictionary meaning for ${lemma}`);

  entry.meaning = formatted;
  // contextMeaning had become a mixture of neutral glosses and occurrence-level meanings.
  // Remove it from the lemma-level dictionary: occurrence-specific context belongs in line vocabulary.inThisPlay.
  delete entry.contextMeaning;
  dictionaryFormatted += 1;
}

const dictByLemma = new Map();
for (const [key, entry] of Object.entries(dict)) {
  dictByLemma.set(exactLemma(key), entry);
  dictByLemma.set(exactLemma(entry?.lemma), entry);
}

let vocabularyItems = 0;
let vocabularyMeaningUpdated = 0;
let inThisPlayItems = 0;
let removedStaleInThisPlay = 0;
let curatedMatched = 0;
const missingDictionary = [];
const unmatchedCurated = new Set(playByExact.keys());
const examples = [];

for (const [speechId, rows] of Object.entries(vocab)) {
  if (!Array.isArray(rows)) throw new Error(`vocabulary.${speechId}: array required`);
  for (const item of rows) {
    vocabularyItems += 1;
    const dictEntry = dictByLemma.get(exactLemma(item.lemma));
    if (!dictEntry?.meaning) {
      missingDictionary.push({ speechId, surface: item.surface, lemma: item.lemma });
      continue;
    }

    if (item.meaning !== dictEntry.meaning) vocabularyMeaningUpdated += 1;
    item.meaning = dictEntry.meaning;

    const contextKey = `${speechId}\u0000${norm(item.surface)}\u0000${norm(item.lemma)}`;
    const curated = playByExact.get(contextKey);
    if (curated && compact(curated) !== compact(dictEntry.meaning)) {
      item.inThisPlay = curated;
      inThisPlayItems += 1;
      curatedMatched += 1;
      unmatchedCurated.delete(contextKey);
      if (examples.length < 12) examples.push({ speechId, surface: item.surface, lemma: item.lemma, meaning: item.meaning, inThisPlay: curated });
    } else {
      if (Object.prototype.hasOwnProperty.call(item, 'inThisPlay')) removedStaleInThisPlay += 1;
      delete item.inThisPlay;
      if (curated) {
        curatedMatched += 1;
        unmatchedCurated.delete(contextKey);
      }
    }
  }
}

if (missingDictionary.length) throw new Error(`missing dictionary meanings: ${JSON.stringify(missingDictionary.slice(0, 10))}`);
if (Object.keys(vocab).length !== 1164) throw new Error(`vocabulary speech coverage ${Object.keys(vocab).length}/1164`);
if (unmatchedCurated.size) throw new Error(`unmatched curated In this play entries: ${JSON.stringify([...unmatchedCurated].slice(0, 10))}`);

for (const [speechId, rows] of Object.entries(vocab)) {
  for (const item of rows) {
    if (!item.surface || !item.lemma || !item.meaning || typeof item.playMeaning !== 'boolean') throw new Error(`invalid vocabulary entry ${speechId}`);
    const d = dictByLemma.get(exactLemma(item.lemma));
    if (!d || item.meaning !== d.meaning) throw new Error(`meaning/dictionary mismatch ${speechId}: ${item.lemma}`);
    if (Object.prototype.hasOwnProperty.call(item, 'inThisPlay') && !String(item.inThisPlay || '').trim()) throw new Error(`blank inThisPlay ${speechId}: ${item.lemma}`);
  }
}

write(VOCAB, vocab);
write(DICT, dict);
const vocabSha = sha256(VOCAB);
const dictSha = sha256(DICT);

if (exists(CONTRACT)) {
  const contract = read(CONTRACT);
  for (const file of contract.files || []) {
    if (file.path === VOCAB) file.sha256 = vocabSha;
    if (file.path === DICT) file.sha256 = dictSha;
  }
  write(CONTRACT, contract);
}

if (exists(MANIFEST)) {
  const manifest = read(MANIFEST);
  manifest.studyAssets ||= {};
  manifest.studyAssets.lineVocabulary ||= { file: VOCAB };
  manifest.studyAssets.lineVocabulary.sha256 = vocabSha;
  manifest.studyAssets.lineVocabulary.coverageSpeechIds = 1164;
  manifest.studyAssets.lineVocabulary.items = vocabularyItems;
  manifest.studyAssets.lineVocabulary.inThisPlayItems = inThisPlayItems;
  manifest.studyAssets.wordDictionary ||= { file: DICT };
  manifest.studyAssets.wordDictionary.sha256 = dictSha;
  manifest.studyAssets.wordDictionary.entries = Object.keys(dict).length;
  manifest.studyAssets.wordDictionary.meaningField = 'meaning';
  write(MANIFEST, manifest);
}

if (exists(EXPANSION_REPORT)) {
  const report = read(EXPANSION_REPORT);
  if (report.vocabulary) report.vocabulary.sha256 = vocabSha;
  if (report.dictionary) report.dictionary.sha256 = dictSha;
  report.presentation ||= {};
  report.presentation.meaningPolicy = 'Dictionary-neutral Japanese gloss; one-word entries use dictionary-style POS headings.';
  report.presentation.inThisPlayPolicy = 'Optional. Present only when curated contextMeaning materially differs from the neutral dictionary meaning or encodes speaker intent/pragmatic force.';
  report.presentation.inThisPlayItems = inThisPlayItems;
  write(EXPANSION_REPORT, report);
}

const report = {
  schemaVersion: 1,
  status: 'PASS',
  policy: {
    meaning: 'Neutral dictionary Japanese. Single lexical items use dictionary-style part-of-speech headings and line breaks where the source safely supports them.',
    inThisPlay: 'Optional occurrence-level field. Restored only from non-empty, manually reviewed contextMeaning in block line-vocabulary sources and omitted otherwise.',
    compatibility: 'Existing playMeaning booleans are preserved because runtime currently uses them as a presentation filter.'
  },
  sources: {
    neutralDictionaryFiles: neutralFiles,
    curatedPlayMeaningFiles: playFiles,
    curatedNonEmpty: sourceNonEmpty
  },
  dictionary: {
    entries: Object.keys(dict).length,
    formatted: dictionaryFormatted,
    neutralSourceExact: dictionarySourceExact,
    fallbackCount: dictionarySourceFallback,
    fallbackLemmas: fallbackLemmas.slice(0, 100),
    sha256: dictSha
  },
  vocabulary: {
    speeches: Object.keys(vocab).length,
    items: vocabularyItems,
    meaningUpdated: vocabularyMeaningUpdated,
    inThisPlayItems,
    curatedMatched,
    removedStaleInThisPlay,
    sha256: vocabSha
  },
  examples
};
write(REPORT, report);

console.log(JSON.stringify(report, null, 2));
