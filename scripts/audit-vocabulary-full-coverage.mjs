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
const dictByLower = new Map(Object.entries(dict).map(([lemma, entry]) => [key(lemma), { lemma, entry }]));

const FUNCTION_WORDS = new Set(`a an the this that these those i me my mine myself we us our ours ourselves you your yours yourself yourselves he him his himself she her hers herself it its itself they them their theirs themselves who whom whose which what where when why how and or but nor so yet if unless until while although though because since as than to of in on at by for from with without about against between among through during before after above below over under up down out off into onto upon is am are was were be been being have has had do does did can could may might must shall should will would not no yes very too also only just even ever never still already again here there then now well oh ah huh hmm mm er um uh please thanks thank hello hi goodbye mr mrs miss ms sir madam major sergeant superintendent one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty first second third last next another other same each every all both either neither some any much many few little more most less least enough such own rather quite really simply perhaps maybe probably certainly sure surely indeed else whether whenever wherever however whatever whoever someone somebody anyone anybody everyone everybody nobody something anything everything nothing`.split(/\s+/));
const NAME_TOKENS = new Set(`mollie giles christopher wren boyle metcalf casewell paravicini trotter hogben maureen lyon georgie kathy jimmy`.split(/\s+/));
const CONTRACTION_BASES = new Set(`i you he she it we they that there here who what where when why how is are was were have has had do does did can could may might must shall should will would let`.split(/\s+/));
const IRREGULAR = {
  arose:'arise', awoke:'awake', awakened:'awaken', became:'become', begun:'begin', began:'begin', bent:'bend', bet:'bet', bit:'bite', bitten:'bite', blew:'blow', blown:'blow', broke:'break', broken:'break', brought:'bring', built:'build', bought:'buy', caught:'catch', chose:'choose', chosen:'choose', came:'come', cost:'cost', cut:'cut', dealt:'deal', dug:'dig', done:'do', drew:'draw', drawn:'draw', drank:'drink', drunk:'drink', drove:'drive', driven:'drive', ate:'eat', eaten:'eat', fell:'fall', fallen:'fall', fed:'feed', felt:'feel', fought:'fight', found:'find', fled:'flee', flew:'fly', flown:'fly', forgot:'forget', forgotten:'forget', forgave:'forgive', forgiven:'give', froze:'freeze', frozen:'freeze', got:'get', gotten:'get', gave:'give', given:'give', went:'go', gone:'go', grew:'grow', grown:'grow', hung:'hang', heard:'hear', hid:'hide', hidden:'hide', hit:'hit', held:'hold', kept:'keep', knew:'know', known:'know', laid:'lay', led:'lead', left:'leave', lent:'lend', let:'let', lay:'lie', lain:'lie', lost:'lose', made:'make', meant:'mean', met:'meet', paid:'pay', put:'put', read:'read', rode:'ride', ridden:'ride', rang:'ring', rung:'ring', rose:'rise', risen:'rise', ran:'run', said:'say', saw:'see', seen:'see', sold:'sell', sent:'send', shook:'shake', shaken:'shake', shot:'shoot', showed:'show', shown:'show', shut:'shut', sang:'sing', sung:'sing', sank:'sink', sunk:'sink', sat:'sit', slept:'sleep', spoke:'speak', spoken:'speak', spent:'spend', stood:'stand', stole:'steal', stolen:'steal', stuck:'stick', struck:'strike', swore:'swear', sworn:'swear', swam:'swim', swum:'swim', took:'take', taken:'take', taught:'teach', tore:'tear', torn:'tear', told:'tell', thought:'think', threw:'throw', thrown:'throw', understood:'understand', woke:'wake', worn:'wear', wore:'wear', won:'win', wrote:'write', written:'write'
};

const isFunctionOrContraction = lower => {
  if (FUNCTION_WORDS.has(lower)) return true;
  if (!lower.includes("'")) return false;
  if (/n't$/.test(lower)) return true;
  const m = lower.match(/^([a-z]+)'(m|re|ve|d|ll|s)$/);
  return Boolean(m && CONTRACTION_BASES.has(m[1]));
};

const morphologyCandidates = lower => {
  const out = new Set();
  if (IRREGULAR[lower]) out.add(IRREGULAR[lower]);
  if (lower.endsWith("'s") && lower.length > 2) out.add(lower.slice(0, -2));
  if (lower.endsWith('ies') && lower.length > 4) out.add(lower.slice(0, -3) + 'y');
  if (lower.endsWith('ied') && lower.length > 4) out.add(lower.slice(0, -3) + 'y');
  if (lower.endsWith('ves') && lower.length > 4) { out.add(lower.slice(0, -3) + 'f'); out.add(lower.slice(0, -3) + 'fe'); }
  if (lower.endsWith('es') && lower.length > 3) { out.add(lower.slice(0, -2)); out.add(lower.slice(0, -1)); }
  if (lower.endsWith('s') && lower.length > 3 && !lower.endsWith('ss')) out.add(lower.slice(0, -1));
  if (lower.endsWith('ing') && lower.length > 5) {
    const stem = lower.slice(0, -3); out.add(stem); out.add(stem + 'e');
    if (/(.)\1$/.test(stem)) out.add(stem.slice(0, -1));
  }
  if (lower.endsWith('ed') && lower.length > 4) {
    const stem = lower.slice(0, -2); out.add(stem); out.add(stem + 'e');
    if (/(.)\1$/.test(stem)) out.add(stem.slice(0, -1));
  }
  if (lower.endsWith('er') && lower.length > 4) { const stem=lower.slice(0,-2); out.add(stem); if (/(.)\1$/.test(stem)) out.add(stem.slice(0,-1)); out.add(stem+'e'); }
  if (lower.endsWith('est') && lower.length > 5) { const stem=lower.slice(0,-3); out.add(stem); if (/(.)\1$/.test(stem)) out.add(stem.slice(0,-1)); out.add(stem+'e'); }
  return [...out];
};

const tokenStats = new Map();
for (const speech of speeches) {
  const text = norm(speech.text);
  for (const t of wordTokens(text)) {
    const row = tokenStats.get(t.lower) || { count:0, capitalized:0, midSentenceCapitalized:0 };
    row.count += 1;
    if (/^[A-Z]/.test(t.surface)) row.capitalized += 1;
    const prefix = text.slice(0, t.index).trimEnd();
    const sentenceInitial = !prefix || /[.!?]\s*$/.test(prefix) || /[―—]\s*$/.test(prefix);
    if (/^[A-Z]/.test(t.surface) && !sentenceInitial) row.midSentenceCapitalized += 1;
    tokenStats.set(t.lower, row);
  }
}

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
let tokenCount=0, functionTokenCount=0, nameTokenCount=0, properDeferredCount=0;
const unknownTokenFreq = new Map();

for (const speech of speeches) {
  const text = norm(speech.text);
  const lowerText = text.toLowerCase();
  const currentPairs = currentPairsBySpeech.get(speech.id) || new Set();

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
    addCandidate({speechId:speech.id,speaker:speech.speaker,kind:isPoly?'REVIEW_POLYSEMY_EXISTING_SURFACE':'ADD_EXISTING_SURFACE',surface:match[2],lemma:dictHit.lemma,meaning:dictHit.entry.meaning,reason:isPoly?'Known surface/lemma occurs here but dictionary entry is polysemous; select the local sense before adding.':'Known validated surface/lemma occurs in another speech and can be associated here with the same neutral dictionary entry.'});
  }

  const rows = Array.isArray(vocab[speech.id]) ? vocab[speech.id] : [];
  for (const token of wordTokens(text)) {
    tokenCount += 1;
    if (isFunctionOrContraction(token.lower)) { functionTokenCount += 1; continue; }
    if (NAME_TOKENS.has(token.lower)) { nameTokenCount += 1; continue; }
    if (rows.some(item => wordTokens(item.surface).some(t => t.lower === token.lower))) continue;

    const directDict = dictByLower.get(token.lower);
    if (directDict && !/\s/.test(directDict.lemma)) {
      const isPoly = Array.isArray(directDict.entry?.tags) && directDict.entry.tags.includes('polysemy');
      addCandidate({speechId:speech.id,speaker:speech.speaker,kind:isPoly?'REVIEW_POLYSEMY_EXACT_DICTIONARY':'ADD_EXACT_DICTIONARY',surface:token.surface,lemma:directDict.lemma,meaning:directDict.entry.meaning,reason:isPoly?'Exact dictionary lexeme occurs but is polysemous; select the local sense.':'Exact non-polysemous dictionary lexeme occurs and is not currently associated with this speech.'});
      continue;
    }

    // Prefer evidence that an unresolved capitalized form is a name/title over a morphology guess.
    const stats = tokenStats.get(token.lower);
    if (/^[A-Z]/.test(token.surface) && stats?.midSentenceCapitalized > 0) {
      properDeferredCount += 1;
      addCandidate({speechId:speech.id,speaker:speech.speaker,kind:'DEFER_PROPER_NOUN_PHASE3',surface:token.surface,lemma:'',reason:'Capitalized outside sentence-initial position and not resolved to an exact dictionary lemma; defer identity/completeness review to Phase 3 before morphology.'});
      continue;
    }

    let morphHit = null;
    for (const lemmaLower of morphologyCandidates(token.lower)) {
      const hit = dictByLower.get(lemmaLower);
      if (hit && !/\s/.test(hit.lemma)) { morphHit = hit; break; }
    }
    if (morphHit) {
      const isPoly = Array.isArray(morphHit.entry?.tags) && morphHit.entry.tags.includes('polysemy');
      addCandidate({speechId:speech.id,speaker:speech.speaker,kind:isPoly?'REVIEW_POLYSEMY_MORPHOLOGY':'ADD_MORPHOLOGY',surface:token.surface,lemma:morphHit.lemma,meaning:morphHit.entry.meaning,reason:isPoly?'Inflected form resolves to an existing polysemous lemma; select the local sense before adding.':'Inflected form resolves mechanically to an existing non-polysemous dictionary lemma.'});
      continue;
    }

    if (stats?.midSentenceCapitalized > 0) {
      properDeferredCount += 1;
      addCandidate({speechId:speech.id,speaker:speech.speaker,kind:'DEFER_PROPER_NOUN_PHASE3',surface:token.surface,lemma:'',reason:'Capitalized outside sentence-initial position and not resolved to an existing dictionary lemma; defer identity/completeness review to Phase 3.'});
      continue;
    }

    unknownTokenFreq.set(token.lower,(unknownTokenFreq.get(token.lower)||0)+1);
    addCandidate({speechId:speech.id,speaker:speech.speaker,kind:'REVIEW_NEW_LEXEME_OR_EXCLUSION',surface:token.surface,lemma:'',reason:'Non-function dialogue token is not covered and does not resolve to an existing dictionary lemma by the conservative morphology rules. Review as a new lexeme or explicit intentional exclusion.'});
  }
}

const candidates=[...candidateById.values()];
const kinds=[...new Set(candidates.map(x=>x.kind))].sort();
const byKind=Object.fromEntries(kinds.map(kind=>[kind,candidates.filter(x=>x.kind===kind).length]));
const unknownTypes=[...unknownTokenFreq.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([token,count])=>({token,count}));
const polysemyLemmas=[...new Set(candidates.filter(x=>x.kind.startsWith('REVIEW_POLYSEMY')).map(x=>x.lemma))].sort((a,b)=>a.localeCompare(b));
const properNounTypes=[...new Set(candidates.filter(x=>x.kind==='DEFER_PROPER_NOUN_PHASE3').map(x=>key(x.surface)))].sort();

const report={schemaVersion:3,status:'AUDIT_COMPLETE',scope:'Dialogue vocabulary coverage across all 1,164 canonical speeches. Stage directions and proper-noun completeness are audited separately in Phase 3.',policy:{functionWords:'Explicit closed-class/high-frequency discourse list and grammatical contractions may be intentionally excluded.',easyContentWords:'Not automatically excluded merely for being easy.',existingSurfaceReuse:'A surface→lemma mapping is reusable only when globally unambiguous and the dictionary entry exists.',morphology:'Only conservative transformations that resolve to an existing single-word dictionary key are accepted, after proper-name evidence is checked.',polysemy:'Never auto-add without inThisPlay review.',properNouns:'Capitalized unresolved types are deferred, not silently excluded.',unknownContentTokens:'Remain review-required until added or explicitly classified.'},counts:{canonicalSpeeches:speeches.length,vocabularyItems:Object.values(vocab).reduce((n,rows)=>n+(Array.isArray(rows)?rows.length:0),0),dictionaryEntries:Object.keys(dict).length,tokenCount,functionTokenCount,knownNameTokenCount:nameTokenCount,properDeferredCount,reviewCandidates:candidates.length,unknownTokenTypes:unknownTypes.length,polysemyLemmaTypes:polysemyLemmas.length,properNounDeferredTypes:properNounTypes.length,byKind},compact:{polysemyLemmas,properNounTypes,topUnknownTokenTypes:unknownTypes.slice(0,300)},candidates};
if(speeches.length!==1164)throw new Error(`canonical speech count mismatch: ${speeches.length}`);
write('data/vocabulary-full-coverage-audit.json',report);
write('data/vocabulary-full-coverage-summary.json',{schemaVersion:3,status:'AUDIT_COMPLETE',counts:report.counts,compact:report.compact});
console.log(JSON.stringify({counts:report.counts,compact:{polysemyLemmas,properNounTypes:properNounTypes.slice(0,80),topUnknownTokenTypes:unknownTypes.slice(0,120)}},null,2));
