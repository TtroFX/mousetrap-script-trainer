import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const norm = v => String(v ?? '').normalize('NFKC').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').trim();
const key = v => norm(v).toLowerCase();
const wordTokens = text => [...norm(text).matchAll(/[A-Za-z]+(?:'[A-Za-z]+)*/g)].map(m => ({ surface: m[0], lower: m[0].toLowerCase(), index: m.index }));

const script = read('mousetrap_script_data.json');
const vocab = read('mousetrap_line_vocabulary.json');
const dict = read('mousetrap_word_dictionary.json');

const speeches = Object.values(script).flatMap(scene => scene?.speeches || []);
const speechById = new Map(speeches.map(s => [s.id, s]));
const dictByLower = new Map(Object.entries(dict).map(([lemma, entry]) => [key(lemma), { lemma, entry }]));

const FUNCTION_WORDS = new Set(`a an the this that these those i me my mine myself we us our ours ourselves you your yours yourself yourselves he him his himself she her hers herself it its itself they them their theirs themselves who whom whose which what where when why how and or but nor so yet if unless until while although though because since as than to of in on at by for from with without about against between among through during before after above below over under up down out off into onto upon is am are was were be been being have has had do does did can could may might must shall should will would not no yes very too also only just even ever never still already again here there then now well oh ah huh hmm mm er um uh please thanks thank hello hi goodbye mr mrs miss ms sir madam major sergeant superintendent one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty first second third last next another other same each every all both either neither some any much many few little more most less least enough such own rather quite really simply perhaps maybe probably certainly sure surely indeed else whether whenever wherever however whatever whoever`.split(/\s+/));

const NAME_TOKENS = new Set(`mollie giles christopher wren boyle metcalf casewell paravicini trotter hogben maureen lyon georgie kathy jimmy`.split(/\s+/));

const currentPairsBySpeech = new Map();
const surfaceMappings = new Map();
for (const [speechId, rows] of Object.entries(vocab)) {
  const pairs = new Set();
  for (const item of Array.isArray(rows) ? rows : []) {
    pairs.add(`${key(item.surface)}\u0000${key(item.lemma)}`);
    const sk = key(item.surface);
    if (!sk) continue;
    if (!surfaceMappings.has(sk)) surfaceMappings.set(sk, new Set());
    surfaceMappings.get(sk).add(key(item.lemma));
  }
  currentPairsBySpeech.set(speechId, pairs);
}

const uniqueSurfaceMap = new Map();
for (const [surface, lemmas] of surfaceMappings) if (lemmas.size === 1) uniqueSurfaceMap.set(surface, [...lemmas][0]);

const candidateById = new Map();
const addCandidate = row => {
  const id = `${row.speechId}\u0000${row.kind}\u0000${key(row.surface)}\u0000${key(row.lemma || '')}`;
  if (!candidateById.has(id)) candidateById.set(id, row);
};

let tokenCount = 0;
let functionTokenCount = 0;
let nameTokenCount = 0;
const unknownTokenFreq = new Map();

for (const speech of speeches) {
  const text = norm(speech.text);
  const lowerText = text.toLowerCase();
  const currentPairs = currentPairsBySpeech.get(speech.id) || new Set();

  // Reuse previously validated multiword/singleword surfaces globally.
  for (const [surfaceLower, lemmaLower] of uniqueSurfaceMap) {
    if (!surfaceLower || !lowerText.includes(surfaceLower)) continue;
    const escaped = surfaceLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const re = new RegExp(`(^|[^A-Za-z])(${escaped})(?=$|[^A-Za-z])`, 'i');
    const match = text.match(re);
    if (!match) continue;
    const pair = `${surfaceLower}\u0000${lemmaLower}`;
    if (currentPairs.has(pair)) continue;
    const dictHit = dictByLower.get(lemmaLower);
    if (!dictHit) continue;
    const isPoly = Array.isArray(dictHit.entry?.tags) && dictHit.entry.tags.includes('polysemy');
    addCandidate({
      speechId: speech.id,
      speaker: speech.speaker,
      kind: isPoly ? 'REVIEW_POLYSEMY_EXISTING_SURFACE' : 'ADD_EXISTING_SURFACE',
      surface: match[2],
      lemma: dictHit.lemma,
      meaning: dictHit.entry.meaning,
      reason: isPoly ? 'Known surface/lemma occurs here but dictionary entry is polysemous; context must be selected before adding.' : 'Known validated surface/lemma occurs in another speech and can be associated here with the same neutral dictionary entry.'
    });
  }

  for (const token of wordTokens(text)) {
    tokenCount += 1;
    if (FUNCTION_WORDS.has(token.lower)) { functionTokenCount += 1; continue; }
    if (NAME_TOKENS.has(token.lower)) { nameTokenCount += 1; continue; }

    // If the token is already contained in any current vocabulary surface for this speech, it is reviewed.
    const rows = Array.isArray(vocab[speech.id]) ? vocab[speech.id] : [];
    if (rows.some(item => wordTokens(item.surface).some(t => t.lower === token.lower))) continue;

    const directDict = dictByLower.get(token.lower);
    if (directDict && !/\s/.test(directDict.lemma)) {
      const isPoly = Array.isArray(directDict.entry?.tags) && directDict.entry.tags.includes('polysemy');
      addCandidate({
        speechId: speech.id,
        speaker: speech.speaker,
        kind: isPoly ? 'REVIEW_POLYSEMY_EXACT_DICTIONARY' : 'ADD_EXACT_DICTIONARY',
        surface: token.surface,
        lemma: directDict.lemma,
        meaning: directDict.entry.meaning,
        reason: isPoly ? 'Exact dictionary lexeme occurs but is polysemous; context must be selected.' : 'Exact dictionary lexeme occurs and is not currently associated with this speech.'
      });
      continue;
    }

    unknownTokenFreq.set(token.lower, (unknownTokenFreq.get(token.lower) || 0) + 1);
    addCandidate({
      speechId: speech.id,
      speaker: speech.speaker,
      kind: 'REVIEW_NEW_OR_MORPHOLOGY',
      surface: token.surface,
      lemma: '',
      reason: 'Non-function dialogue token is not covered by a current vocabulary surface and has no exact single-word dictionary key. Review for morphology, common inflection, new lexeme, proper noun, or intentional exclusion.'
    });
  }
}

const candidates = [...candidateById.values()];
const byKind = Object.fromEntries([...new Set(candidates.map(x => x.kind))].sort().map(kind => [kind, candidates.filter(x => x.kind === kind).length]));
const unknownTypes = [...unknownTokenFreq.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).map(([token,count]) => ({token,count}));

const report = {
  schemaVersion: 1,
  status: 'AUDIT_COMPLETE',
  scope: 'Dialogue vocabulary coverage across all 1,164 canonical speeches. Stage directions and proper-noun completeness are audited separately in Phase 3.',
  policy: {
    functionWords: 'Explicit closed-class/high-frequency discourse list may be intentionally excluded.',
    easyContentWords: 'Not automatically excluded merely for being easy.',
    existingSurfaceReuse: 'A surface→lemma mapping is reusable only when globally unambiguous and the dictionary entry exists.',
    polysemy: 'Never auto-add without inThisPlay review.',
    unknownContentTokens: 'Remain review-required until classified as morphology/existing lemma, new lexeme, proper noun deferred to Phase 3, or explicit exclusion.'
  },
  counts: {
    canonicalSpeeches: speeches.length,
    vocabularyItems: Object.values(vocab).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0),
    dictionaryEntries: Object.keys(dict).length,
    tokenCount,
    functionTokenCount,
    knownNameTokenCount: nameTokenCount,
    reviewCandidates: candidates.length,
    unknownTokenTypes: unknownTypes.length,
    byKind
  },
  topUnknownTokenTypes: unknownTypes.slice(0, 250),
  candidates
};

if (speeches.length !== 1164) throw new Error(`canonical speech count mismatch: ${speeches.length}`);
write('data/vocabulary-full-coverage-audit.json', report);
console.log(JSON.stringify(report.counts, null, 2));
