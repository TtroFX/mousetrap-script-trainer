import fs from 'node:fs';

const script = JSON.parse(fs.readFileSync('mousetrap_script_data.json', 'utf8'));
const dictionary = JSON.parse(fs.readFileSync('mousetrap_word_dictionary.json', 'utf8'));
const lineVocabulary = JSON.parse(fs.readFileSync('mousetrap_line_vocabulary.json', 'utf8'));

const allSpeeches = [
  ...script['act1-scene1'].speeches,
  ...script['act1-scene2'].speeches,
  ...script.act2.speeches,
];
if (allSpeeches.length !== 1164) throw new Error(`Expected 1164 speeches, got ${allSpeeches.length}`);

// Screening policy, not an official CEFR classifier:
// keep broadly all content-word candidates and exclude only clear A1/basic items.
// This intentionally errs on the side of inclusion so A2-ish words such as "abuse" are not missed.
const A1_EXCLUDE = new Set(`
 a an the this that these those i me my mine you your yours he him his she her hers it its we us our ours they them their theirs
 who whom whose what which where when why how
 am is are was were be been being have has had having do does did doing
 can could may might must shall should will would
 and or but if because so than as while although though not no yes
 in on at by for from to of with without into onto over under above below between among through across around before after during about against
 here there now then today tomorrow yesterday
 one two three four five six seven eight nine ten first second third
 all any some many much more most few little less least another other same each every both either neither
 very too quite really just only even also again still already yet
 go come get make take give put keep let bring leave find know think say tell ask answer see look watch hear listen feel want need like love hate help use try work play live move stop start begin end open close turn
 good bad big small long short high low old young new nice great right wrong easy hard hot cold warm happy sad sorry sure ready busy free full empty
 man woman boy girl child children person people friend family mother father mum dad husband wife son daughter brother sister
 house home room door window table chair bed school class teacher student job money food water tea coffee milk bread day night morning afternoon evening week month year time hour minute place way thing stuff name number part kind lot
 red blue green black white hand head face eye eyes ear ears nose mouth hair arm leg foot feet back side car road street town city country world
 come go went gone made took taken gave given saw seen knew known thought said told found felt left brought kept got
`.trim().split(/\s+/));

const IRREGULAR = new Map(Object.entries({
  men:'man', women:'woman', children:'child', people:'person', feet:'foot', teeth:'tooth', mice:'mouse', geese:'goose',
  better:'good', best:'good', worse:'bad', worst:'bad',
  went:'go', gone:'go', came:'come', got:'get', gotten:'get', made:'make', took:'take', taken:'take', gave:'give', given:'give',
  saw:'see', seen:'see', knew:'know', known:'know', thought:'think', said:'say', told:'tell', found:'find', felt:'feel', left:'leave', brought:'bring', kept:'keep',
  did:'do', done:'do', had:'have', was:'be', were:'be', been:'be',
}));

function norm(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/^'+|'+$/g, '')
    .trim();
}

function plausibleBases(word) {
  const w = norm(word).replace(/'s$/, '');
  const out = new Set([w]);
  if (IRREGULAR.has(w)) out.add(IRREGULAR.get(w));
  if (w.length > 4 && w.endsWith('ies')) out.add(w.slice(0, -3) + 'y');
  if (w.length > 4 && w.endsWith('es')) {
    out.add(w.slice(0, -2));
    out.add(w.slice(0, -1));
  } else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) {
    out.add(w.slice(0, -1));
  }
  if (w.length > 5 && w.endsWith('ied')) out.add(w.slice(0, -3) + 'y');
  if (w.length > 4 && w.endsWith('ed')) {
    const stem = w.slice(0, -2);
    out.add(stem);
    out.add(stem + 'e');
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) out.add(stem.slice(0, -1));
  }
  if (w.length > 5 && w.endsWith('ing')) {
    const stem = w.slice(0, -3);
    out.add(stem);
    out.add(stem + 'e');
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) out.add(stem.slice(0, -1));
  }
  return [...out].filter(Boolean);
}

const implemented = new Set(Object.keys(dictionary).map(norm));
for (const rows of Object.values(lineVocabulary)) {
  if (!Array.isArray(rows)) continue;
  for (const row of rows) {
    if (row?.lemma) implemented.add(norm(row.lemma));
    if (row?.surface && /^[A-Za-z][A-Za-z'’-]*$/.test(row.surface.trim())) implemented.add(norm(row.surface));
  }
}

const properNames = new Set([
  'mollie','giles','christopher','wren','boyle','metcalf','casewell','paravicini','trotter','ralston','barlow','maureen','lyon','culver','paddington',
  'monkswell','monkwell','scotland','scottish','england','english','london','berkshire','benares','dickens','scrooge','harriet','india','indian',
  'aga','bbc','blenheim','stalingrad','stamford','norfolk','longridge','corrigan','georgie','jimmy','kathy','john','mary','mrs','mr','miss','major','sergeant',
]);

function tokenise(text) {
  return String(text ?? '').replace(/[‘’]/g, "'").match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
}

function chooseHeadword(surface, corpusSet) {
  const options = plausibleBases(surface);
  if (IRREGULAR.has(norm(surface))) return IRREGULAR.get(norm(surface));
  // Prefer a form that actually occurs independently in this quarter.
  for (const candidate of options.slice(1)) if (corpusSet.has(candidate)) return candidate;
  // Conservative morphology only when unambiguous enough.
  const w = norm(surface).replace(/'s$/, '');
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
  return w;
}

function analyseQuarter(startGlobal, endGlobal, label) {
  const speeches = allSpeeches.slice(startGlobal - 1, endGlobal);
  if (speeches.length !== endGlobal - startGlobal + 1) throw new Error(`${label}: speech range mismatch`);

  const raw = [];
  const corpusSet = new Set();
  for (const speech of speeches) for (const token of tokenise(speech.text)) corpusSet.add(norm(token));

  for (const speech of speeches) {
    for (const surface of tokenise(speech.text)) {
      const lower = norm(surface).replace(/'s$/, '');
      if (!lower || lower.length < 2) continue;
      if (properNames.has(lower)) continue;
      if (A1_EXCLUDE.has(lower)) continue;
      if (/^(?:i'm|i've|i'll|i'd|you're|you've|you'll|you'd|he's|she's|it's|we're|we've|we'll|they're|they've|they'll|that's|there's|what's|who's|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|can't|couldn't|won't|wouldn't|shouldn't|mustn't|shan't|let's)$/.test(lower)) continue;
      raw.push({ surface: lower, speechId: speech.id });
    }
  }

  const byHeadword = new Map();
  for (const item of raw) {
    const headword = chooseHeadword(item.surface, corpusSet);
    if (!headword || A1_EXCLUDE.has(headword) || properNames.has(headword)) continue;
    const entry = byHeadword.get(headword) ?? { count: 0, surfaces: new Set(), firstSpeechId: item.speechId };
    entry.count += 1;
    entry.surfaces.add(item.surface);
    byHeadword.set(headword, entry);
  }

  const deduped = [...byHeadword.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const finalRows = deduped.filter(([headword, data]) => {
    const forms = new Set([headword, ...data.surfaces]);
    for (const form of forms) for (const base of plausibleBases(form)) if (implemented.has(base)) return false;
    return true;
  });

  const lines = [];
  lines.push(`THE MOUSETRAP — A2+ ADDITION CANDIDATES — ${label}`);
  lines.push(`Scope: global speeches ${startGlobal}-${endGlobal} (${speeches.length} speeches)`);
  lines.push('Policy: screening list, not official CEFR certification. Clear A1/basic items are excluded; uncertain content words are kept to minimize omissions.');
  lines.push('Dictionary definitions are NOT created in this phase. Existing vocabulary/dictionary data are NOT modified.');
  lines.push('');
  lines.push('PIPELINE');
  lines.push(`1. Extracted non-A1 candidate occurrences: ${raw.length}`);
  lines.push(`2. After normalized/headword deduplication: ${deduped.length}`);
  lines.push(`3. After removing already-implemented dictionary/vocabulary items: ${finalRows.length}`);
  lines.push('');
  lines.push('FINAL ADDITION CANDIDATES');
  lines.push('word\toccurrences\tfirstSpeechId\tsurfaceForms');
  for (const [headword, data] of finalRows) {
    lines.push(`${headword}\t${data.count}\t${data.firstSpeechId}\t${[...data.surfaces].sort().join(', ')}`);
  }
  lines.push('');
  lines.push('NOTE');
  lines.push('- This is deliberately over-inclusive. Final dictionary-writing pass should manually reject proper names, OCR/tokenization artifacts, and words that are actually A1 in the relevant sense.');
  lines.push('- Polysemy must be judged by the sense used in the play; an A1-looking word can still remain if the play uses a harder sense.');
  lines.push('');

  return { text: lines.join('\n'), stats: { raw: raw.length, deduped: deduped.length, final: finalRows.length }, finalRows };
}

const part1 = analyseQuarter(1, 291, 'PART 1 / 1-291');
const part2 = analyseQuarter(292, 582, 'PART 2 / 292-582');

fs.mkdirSync('data/a2plus-candidate-lists', { recursive: true });
fs.writeFileSync('data/a2plus-candidate-lists/part-01.txt', part1.text + '\n');
fs.writeFileSync('data/a2plus-candidate-lists/part-02.txt', part2.text + '\n');

const overlap = part1.finalRows.map(([w])=>w).filter(w => new Set(part2.finalRows.map(([x])=>x)).has(w));
const summary = {
  schemaVersion: 1,
  status: 'PASS',
  policy: 'A2+ screening by conservative A1 exclusion; intentionally over-inclusive',
  parts: {
    part1: { scope:[1,291], ...part1.stats },
    part2: { scope:[292,582], ...part2.stats },
  },
  crossPartOverlapCandidates: overlap.length,
  note: 'Each TXT is independently deduplicated and filtered against current implemented dictionary/vocabulary. Cross-part overlap is intentionally reported, not silently removed, so each quarter remains auditable.'
};
fs.writeFileSync('data/a2plus-candidate-lists/summary.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
