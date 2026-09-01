import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = p => fs.existsSync(p);
const norm = s => String(s ?? '').toLowerCase().normalize('NFKC').replace(/[‘’]/g, "'").trim();

const candidatePath = 'data/a2plus-candidate-lists/part-01-02-unique.txt';
const candidateLines = fs.readFileSync(candidatePath, 'utf8').split(/\r?\n/);
const headerIndex = candidateLines.findIndex(line => line.startsWith('word\tcefr\tparts\t'));
if (headerIndex < 0) throw new Error('Candidate header not found');
const candidates = candidateLines.slice(headerIndex + 1).filter(Boolean).map(line => {
  const [word, cefr, parts, occurrences, firstSpeechId, surfaceForms, allOxfordLevels] = line.split('\t');
  return { word:norm(word), cefr, parts, occurrences:Number(occurrences), firstSpeechId, surfaceForms, allOxfordLevels };
});
if (candidates.length !== 297) throw new Error(`Expected 297 candidates, got ${candidates.length}`);

const currentDictionary = read('mousetrap_word_dictionary.json');
const currentKeys = new Set(Object.keys(currentDictionary).map(norm));

const sourceDefinitions = new Map();
function addSourceDefinition(lemma, entry, source, priority = 10) {
  const key = norm(lemma);
  if (!key || !entry || !String(entry.meaning || '').trim()) return;
  const candidate = {
    lemma:key,
    pos:String(entry.pos || '未分類'),
    meaning:String(entry.meaning).trim(),
    tags:Array.isArray(entry.tags) ? entry.tags : [],
    cefr:entry.cefr || null,
    source,
    priority
  };
  const prev = sourceDefinitions.get(key);
  if (!prev || candidate.priority < prev.priority) sourceDefinitions.set(key, candidate);
}

for (let block = 1; block <= 6; block++) {
  for (const suffix of ['dictionary.json','dictionary-supplement.json','neutral-seed.json','neutral-supplement.json']) {
    const p = `data/vocabulary-rebuild/block-${block}-${suffix}`;
    if (!exists(p)) continue;
    const data = read(p);
    const entries = data.entries || data.dictionary || {};
    if (entries && !Array.isArray(entries)) {
      for (const [lemma, entry] of Object.entries(entries)) addSourceDefinition(lemma, entry, p, suffix === 'dictionary.json' ? 3 : 5);
    }
  }
}

const reviewedIncludes = new Map();
const reviewedExcludes = new Map();
for (let block = 2; block <= 6; block++) {
  const p = `data/vocabulary-rebuild/block-${block}-oxford-review.json`;
  if (!exists(p)) continue;
  const data = read(p);
  for (const lex of data.includeLexemes || []) {
    const key = norm(lex.lemma || lex.word);
    if (!key) continue;
    const row = { block, source:p, ...lex, lemma:key };
    const arr = reviewedIncludes.get(key) || [];
    arr.push(row);
    reviewedIncludes.set(key, arr);
    addSourceDefinition(key, { pos:lex.pos, meaning:lex.meaning, tags:lex.tags, cefr:lex.cefr }, p, 1);
  }
  for (const [word, reason] of Object.entries(data.excludeWords || {})) {
    const key = norm(word);
    const arr = reviewedExcludes.get(key) || [];
    arr.push({ block, source:p, reason });
    reviewedExcludes.set(key, arr);
  }
}

const rows = candidates.map(c => {
  const mixedA1 = String(c.allOxfordLevels || '').split('/').includes('A1');
  const includeReviews = reviewedIncludes.get(c.word) || [];
  const excludeReviews = reviewedExcludes.get(c.word) || [];
  const reviewedInclude = includeReviews.length > 0;
  const reusable = sourceDefinitions.get(c.word) || null;
  const alreadyCurrent = currentKeys.has(c.word);
  let disposition = 'include';
  let reason = 'pure-a2plus-candidate';
  if (alreadyCurrent) {
    disposition = 'already-current';
    reason = 'candidate-staleness';
  } else if (mixedA1 && !reviewedInclude) {
    disposition = 'needs-sense-review';
    reason = 'headword-has-a1-and-a2plus-senses';
  } else if (excludeReviews.length && !reviewedInclude) {
    disposition = 'exclude-reviewed';
    reason = 'prior-oxford-sense-review-excluded';
  }
  return {
    ...c,
    mixedA1,
    disposition,
    reason,
    reusableDefinition: reusable ? { pos:reusable.pos, meaning:reusable.meaning, tags:reusable.tags, cefr:reusable.cefr, source:reusable.source } : null,
    reviewedIncludes: includeReviews.map(x => ({ block:x.block, source:x.source, pos:x.pos, meaning:x.meaning, cefr:x.cefr || null, speechIds:x.speechIds || null })),
    reviewedExcludes: excludeReviews
  };
});

const includeRows = rows.filter(r => r.disposition === 'include');
const report = {
  schemaVersion:1,
  status:'PASS',
  scope:{ globalSpeeches:[1,582], candidateCount:candidates.length },
  policy:{
    pureA2Plus:'include by default',
    mixedA1A2Plus:'require prior sense approval or later manual sense review before integration',
    existingNeutralDefinitions:'reuse learner-friendly neutral Block dictionaries/reviews before writing new definitions'
  },
  counts:{
    total:rows.length,
    include:includeRows.length,
    includeWithReusableDefinition:includeRows.filter(r => r.reusableDefinition).length,
    includeNeedingNewDefinition:includeRows.filter(r => !r.reusableDefinition).length,
    needsSenseReview:rows.filter(r => r.disposition === 'needs-sense-review').length,
    excludeReviewed:rows.filter(r => r.disposition === 'exclude-reviewed').length,
    alreadyCurrent:rows.filter(r => r.disposition === 'already-current').length
  },
  missingDefinitionWords:includeRows.filter(r => !r.reusableDefinition).map(r => r.word),
  needsSenseReviewWords:rows.filter(r => r.disposition === 'needs-sense-review').map(r => ({ word:r.word, allOxfordLevels:r.allOxfordLevels, firstSpeechId:r.firstSpeechId, reviewedExcludes:r.reviewedExcludes })),
  rows
};
fs.mkdirSync('data/a2plus-front-half-integration', { recursive:true });
fs.writeFileSync('data/a2plus-front-half-integration/source-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.counts, null, 2));
