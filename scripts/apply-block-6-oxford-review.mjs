import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const review = read('data/vocabulary-rebuild/block-6-oxford-review.json');
const script = read('mousetrap_script_data.json');
const contextPath = 'data/vocabulary-rebuild/block-6-line-vocabulary.json';
const thresholdPath = 'data/vocabulary-rebuild/block-6-b1plus-coverage.json';
const dictionaryPath = 'data/vocabulary-rebuild/block-6-dictionary.json';
const context = read(contextPath);
const threshold = read(thresholdPath);
const dictionary = read(dictionaryPath);
const speeches = script.act2.speeches.slice(423, 638);
const byId = new Map(speeches.map(s => [s.id, s]));
const norm = s => String(s || '').toLowerCase().normalize('NFKC').replace(/[‘’]/g,"'").replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');

function selectedPairExists(speechId, surface, lemma) {
  const key = `${norm(surface)}|${norm(lemma)}`;
  for (const source of [context.lines, threshold.lines]) {
    if ((source?.[speechId] || []).some(e => `${norm(e.surface)}|${norm(e.lemma)}` === key)) return true;
  }
  return false;
}
function findForm(text, forms) {
  for (const form of forms) {
    const escaped = String(form).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = String(text).match(new RegExp(`\\b${escaped}\\b`, 'i'));
    if (m) return m[0];
  }
  return null;
}

const application = [];
let addedEntryCount = 0;
let contextAddedCount = 0;
let thresholdAddedCount = 0;
for (const lex of review.includeLexemes || []) {
  const targetIds = lex.speechIds || [];
  const applied = [];
  if (!String(lex.meaning || '').trim()) throw new Error(`Neutral meaning missing in review: ${lex.lemma}`);
  if (!dictionary.entries[lex.lemma]) {
    dictionary.entries[lex.lemma] = {
      pos: lex.pos || '未分類',
      meaning: lex.meaning,
      ...(lex.tags?.length ? { tags: lex.tags } : {})
    };
  }
  for (const speechId of targetIds) {
    const speech = byId.get(speechId);
    if (!speech) throw new Error(`Review speech outside Block 6: ${speechId} / ${lex.word}`);
    const surface = lex.surface || findForm(speech.text, lex.forms || [lex.word]);
    if (!surface || !norm(speech.text).includes(norm(surface))) {
      throw new Error(`Reviewed surface not found: ${speechId} / ${lex.word} / ${surface || '(none)'}`);
    }
    const contextMeaning = String(lex.contextMeanings?.[speechId] || '').trim();
    const target = contextMeaning ? context.lines : threshold.lines;
    if (!selectedPairExists(speechId, surface, lex.lemma)) {
      (target[speechId] ||= []).push({
        surface,
        lemma: lex.lemma,
        contextMeaning,
        cefrLevel: lex.cefr,
        cefrSource: 'Oxford 3000/5000 review'
      });
      addedEntryCount += 1;
      if (contextMeaning) contextAddedCount += 1;
      else thresholdAddedCount += 1;
    }
    applied.push({speechId, surface, contextMeaningAdded: Boolean(contextMeaning)});
  }
  application.push({word:lex.word, lemma:lex.lemma, cefr:lex.cefr, applications:applied});
}

for (const lines of [context.lines, threshold.lines]) {
  for (const entries of Object.values(lines || {})) entries.sort((a,b)=>String(a.surface).localeCompare(String(b.surface),'en',{sensitivity:'base'}));
}
dictionary.entries = Object.fromEntries(Object.entries(dictionary.entries).sort(([a],[b])=>a.localeCompare(b,'en',{sensitivity:'base'})));
write(contextPath, context);
write(thresholdPath, threshold);
write(dictionaryPath, dictionary);
write('data/vocabulary-rebuild/block-6-oxford-application.json', {
  schemaVersion: 1,
  blockId: 'block-6',
  includedReviewCount: (review.includeLexemes || []).length,
  excludedReviewCount: Object.keys(review.excludeWords || {}).length,
  addedEntryCount,
  contextAddedCount,
  thresholdAddedCount,
  application
});
console.log(JSON.stringify({includedReviewCount:(review.includeLexemes||[]).length, excludedReviewCount:Object.keys(review.excludeWords||{}).length, addedEntryCount, contextAddedCount, thresholdAddedCount}, null, 2));
