import fs from 'node:fs';

const OXFORD_URL = 'https://www.oxfordlearnersdictionaries.com/wordlists/oxford3000-5000';
const script = JSON.parse(fs.readFileSync('mousetrap_script_data.json', 'utf8'));
const dictionary = JSON.parse(fs.readFileSync('mousetrap_word_dictionary.json', 'utf8'));

const allSpeeches = [
  ...script['act1-scene1'].speeches,
  ...script['act1-scene2'].speeches,
  ...script.act2.speeches,
];
if (allSpeeches.length !== 1164) throw new Error(`Expected 1164 speeches, got ${allSpeeches.length}`);

function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFKC').replace(/[‘’]/g, "'")
    .replace(/^'+|'+$/g, '').trim();
}
function decodeHtml(s) {
  return s.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/&ndash;|&mdash;/gi,'-').replace(/&[a-z]+;/gi,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
}
function tokenise(text) {
  return String(text ?? '').replace(/[‘’]/g, "'").match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
}

const response = await fetch(OXFORD_URL, { headers: { 'user-agent': 'Mozilla/5.0 mousetrap-vocabulary-audit' } });
if (!response.ok) throw new Error(`Oxford word list HTTP ${response.status}`);
const html = await response.text();
const visible = decodeHtml(html.replace(/<script\b[\s\S]*?<\/script>/gi,'\n').replace(/<style\b[\s\S]*?<\/style>/gi,'\n').replace(/<[^>]+>/g,'\n'));
const lines = visible.split(/\n+/).map(s=>s.trim()).filter(Boolean);
const posTerms = new Set(['noun','verb','adjective','adverb','preposition','conjunction','pronoun','determiner','exclamation','number','modal verb','indefinite article','auxiliary verb']);
const oxford = new Map();
for (let i=0;i<lines.length;i++) {
  const level = lines[i].toLowerCase();
  if (!/^[abc][12]$/.test(level)) continue;
  let p=i-1;
  while (p>=0 && p>=i-4 && !posTerms.has(lines[p].toLowerCase())) p--;
  if (p<1 || !posTerms.has(lines[p].toLowerCase())) continue;
  const word=norm(lines[p-1]);
  const pos=lines[p].toLowerCase();
  if (!word || word.includes(' ')) continue;
  const arr=oxford.get(word)||[];
  if (!arr.some(x=>x.pos===pos&&x.level===level)) arr.push({pos,level});
  oxford.set(word,arr);
}
if (oxford.size < 3000) throw new Error(`Oxford parser extracted only ${oxford.size} words`);

const A2PLUS_LEVELS = new Set(['a2','b1','b2','c1','c2']);
const LEVEL_ORDER = new Map([['a1',1],['a2',2],['b1',3],['b2',4],['c1',5],['c2',6]]);
const IRREGULAR = new Map(Object.entries({
  men:'man', women:'woman', children:'child', people:'person', feet:'foot', teeth:'tooth', mice:'mouse', geese:'goose',
  went:'go', gone:'go', came:'come', got:'get', gotten:'get', made:'make', took:'take', taken:'take', gave:'give', given:'give',
  saw:'see', seen:'see', knew:'know', known:'know', thought:'think', said:'say', told:'tell', found:'find', felt:'feel', left:'leave', brought:'bring', kept:'keep',
  ran:'run', begun:'begin', began:'begin', heard:'hear', held:'hold', meant:'mean', sent:'send', built:'build', drove:'drive', written:'write', wrote:'write',
  did:'do', done:'do', had:'have', was:'be', were:'be', been:'be',
}));
function variants(token) {
  const w=norm(token).replace(/'s$/,'');
  const out=[];
  const add=x=>{ if(x && !out.includes(x)) out.push(x); };
  add(w);
  if (IRREGULAR.has(w)) add(IRREGULAR.get(w));
  if (w.length>4 && w.endsWith('ies')) add(w.slice(0,-3)+'y');
  if (w.length>4 && w.endsWith('ied')) add(w.slice(0,-3)+'y');
  if (w.length>4 && w.endsWith('es')) { add(w.slice(0,-1)); add(w.slice(0,-2)); }
  if (w.length>3 && w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0,-1));
  if (w.length>4 && w.endsWith('ed')) {
    const stem=w.slice(0,-2); add(stem); add(w.slice(0,-1)); add(stem+'e');
    if (stem.length>2 && stem.at(-1)===stem.at(-2)) add(stem.slice(0,-1));
  }
  if (w.length>5 && w.endsWith('ing')) {
    const stem=w.slice(0,-3); add(stem); add(stem+'e');
    if (stem.length>2 && stem.at(-1)===stem.at(-2)) add(stem.slice(0,-1));
  }
  if (w.length>4 && w.endsWith('er')) add(w.slice(0,-2));
  if (w.length>5 && w.endsWith('est')) add(w.slice(0,-3));
  return out;
}

// The target of this pass is dictionary coverage. A word is "implemented" only
// when its dictionary headword already exists. A line-vocabulary surface alone
// must not suppress a missing dictionary headword (the original abuse gap).
const implementedDictionary = new Set(Object.keys(dictionary).map(norm));

const BASIC_OR_NOISE = new Set(`
a an the this that these those i me my mine you your yours he him his she her hers it its we us our ours they them their theirs
who whom whose what which where when why how am is are was were be been being have has had do does did can could may might must shall should will would
and or but if because so than as not no yes in on at by for from to of with into over under before after about here there now then very too just only also
one two three four five six seven eight nine ten first second all any some many much more most few little another other same each every both
man woman boy girl child person people friend family mother father husband wife son daughter brother sister house home room door window table chair bed
school teacher student job money food water day night morning evening week month year time hour minute place way thing name number car road street town city
be have do go come get make take give put keep let bring leave find know think say tell ask see look hear feel want need like love help use try work play live
open close turn good bad big small long short high low old young new nice great right wrong easy hard hot cold warm happy sad sorry sure ready
oh ah er uh um ha brr humph hullo hello gosh god
`.trim().split(/\s+/));
const PROPER_NAMES = new Set(`
mollie giles christopher wren boyle metcalf casewell paravicini trotter ralston barlow maureen lyon culver paddington monkswell monkwell
scotland scottish england english london berkshire benares dickens scrooge harriet india indian blenheim stalingrad stamford norfolk longridge corrigan
georgie jimmy kathy john mary hogben hampstead kensington bournemouth edinburgh leamington paul leslie chris
`.trim().split(/\s+/));
const CONTRACTION = /(?:n't|'re|'ve|'ll|'d|'m)$/;

function classifyOxfordToken(token) {
  for (const v of variants(token)) {
    const entries=oxford.get(v);
    if (!entries) continue;
    const qualifying=entries.filter(e=>A2PLUS_LEVELS.has(e.level));
    if (qualifying.length) return {word:v, entries, qualifying};
  }
  return null;
}
function displayLevels(entries) {
  return [...new Set(entries.map(e=>e.level.toUpperCase()))]
    .sort((a,b)=>(LEVEL_ORDER.get(a.toLowerCase())??99)-(LEVEL_ORDER.get(b.toLowerCase())??99)).join('/');
}

function analyseQuarter(startGlobal,endGlobal,label) {
  const speeches=allSpeeches.slice(startGlobal-1,endGlobal);
  const extracted=[];
  const unclassified=[];
  for (const speech of speeches) {
    for (const raw of tokenise(speech.text)) {
      const surface=norm(raw);
      const ox=classifyOxfordToken(surface);
      if (ox) {
        extracted.push({word:ox.word,surface,speechId:speech.id,levels:displayLevels(ox.qualifying),allLevels:displayLevels(ox.entries)});
        continue;
      }
      if (surface.length<3 || BASIC_OR_NOISE.has(surface) || PROPER_NAMES.has(surface) || CONTRACTION.test(surface)) continue;
      if (variants(surface).some(v=>implementedDictionary.has(v))) continue;
      if (variants(surface).some(v=>oxford.has(v))) continue;
      unclassified.push({word:surface,surface,speechId:speech.id});
    }
  }

  const dedupeMap=new Map();
  for (const row of extracted) {
    const e=dedupeMap.get(row.word) ?? {word:row.word,count:0,surfaces:new Set(),firstSpeechId:row.speechId,levels:new Set(),allLevels:new Set()};
    e.count++; e.surfaces.add(row.surface); for(const x of row.levels.split('/')) e.levels.add(x); for(const x of row.allLevels.split('/')) e.allLevels.add(x); dedupeMap.set(row.word,e);
  }
  const deduped=[...dedupeMap.values()].sort((a,b)=>a.word.localeCompare(b.word));
  const final=deduped.filter(row=>!implementedDictionary.has(row.word));

  const unknownMap=new Map();
  for(const row of unclassified){
    const e=unknownMap.get(row.word)??{word:row.word,count:0,surfaces:new Set(),firstSpeechId:row.speechId};
    e.count++;e.surfaces.add(row.surface);unknownMap.set(row.word,e);
  }
  const manual=[...unknownMap.values()].sort((a,b)=>a.word.localeCompare(b.word));

  const out=[];
  out.push(`THE MOUSETRAP — A2+ ADDITION CANDIDATES — ${label}`);
  out.push(`Scope: global speeches ${startGlobal}-${endGlobal} (${speeches.length} speeches)`);
  out.push(`CEFR source: Oxford 3000 and 5000 (${oxford.size} parsed headwords)`);
  out.push('Dictionary definitions are NOT created in this phase. Production vocabulary/dictionary files are NOT modified.');
  out.push('');
  out.push('PIPELINE — OXFORD A2+');
  out.push(`1. Extracted A2+ candidate occurrences: ${extracted.length}`);
  out.push(`2. After headword deduplication: ${deduped.length}`);
  out.push(`3. Already-implemented dictionary headwords removed: ${deduped.length-final.length}`);
  out.push(`4. Final Oxford A2+ addition candidates: ${final.length}`);
  out.push('');
  out.push('FINAL OXFORD A2+ ADDITION CANDIDATES');
  out.push('word\tcefr\toccurrences\tfirstSpeechId\tsurfaceForms\tallOxfordLevels');
  for(const row of final){
    const lev=[...row.levels].sort((a,b)=>(LEVEL_ORDER.get(a.toLowerCase())??99)-(LEVEL_ORDER.get(b.toLowerCase())??99)).join('/');
    const all=[...row.allLevels].sort((a,b)=>(LEVEL_ORDER.get(a.toLowerCase())??99)-(LEVEL_ORDER.get(b.toLowerCase())??99)).join('/');
    out.push(`${row.word}\t${lev}\t${row.count}\t${row.firstSpeechId}\t${[...row.surfaces].sort().join(', ')}\t${all}`);
  }
  out.push('');
  out.push('OXFORD-UNCLASSIFIED / MANUAL REVIEW');
  out.push('These are non-basic-looking script tokens not found in the Oxford 3000/5000 parser after removing implemented dictionary headwords.');
  out.push('They are NOT automatically classified as A2+; retain them for later manual review so British/dated/rare words are not silently lost.');
  out.push('word\toccurrences\tfirstSpeechId\tsurfaceForms');
  for(const row of manual) out.push(`${row.word}\t${row.count}\t${row.firstSpeechId}\t${[...row.surfaces].sort().join(', ')}`);
  out.push('');
  return {text:out.join('\n'),final,manual,stats:{extractedOccurrences:extracted.length,deduped:deduped.length,implementedDictionaryRemoved:deduped.length-final.length,finalOxfordA2Plus:final.length,manualUnclassified:manual.length}};
}

const part1=analyseQuarter(1,291,'PART 1 / 1-291');
const part2=analyseQuarter(292,582,'PART 2 / 292-582');

function combine(parts){
  const m=new Map();
  for(const [partName,result] of parts){
    for(const row of result.final){
      const e=m.get(row.word)??{word:row.word,parts:new Set(),count:0,surfaces:new Set(),firstSpeechId:row.firstSpeechId,levels:new Set(),allLevels:new Set()};
      e.parts.add(partName);e.count+=row.count;for(const s of row.surfaces)e.surfaces.add(s);for(const l of row.levels)e.levels.add(l);for(const l of row.allLevels)e.allLevels.add(l);m.set(row.word,e);
    }
  }
  return [...m.values()].sort((a,b)=>a.word.localeCompare(b.word));
}
const combined=combine([['1',part1],['2',part2]]);
const combinedText=[
  'THE MOUSETRAP — A2+ ADDITION CANDIDATES — PARTS 1+2 UNIQUE',
  'Scope: global speeches 1-582',
  'Pipeline: extract Oxford A2+ occurrences -> deduplicate by headword -> remove currently implemented dictionary headwords -> deduplicate across Parts 1 and 2.',
  `Unique final Oxford A2+ candidates across Parts 1+2: ${combined.length}`,
  '',
  'word\tcefr\tparts\toccurrences\tfirstSpeechId\tsurfaceForms\tallOxfordLevels',
  ...combined.map(row=>{
    const lev=[...row.levels].sort((a,b)=>(LEVEL_ORDER.get(a.toLowerCase())??99)-(LEVEL_ORDER.get(b.toLowerCase())??99)).join('/');
    const all=[...row.allLevels].sort((a,b)=>(LEVEL_ORDER.get(a.toLowerCase())??99)-(LEVEL_ORDER.get(b.toLowerCase())??99)).join('/');
    return `${row.word}\t${lev}\t${[...row.parts].join(',')}\t${row.count}\t${row.firstSpeechId}\t${[...row.surfaces].sort().join(', ')}\t${all}`;
  }),
  ''
].join('\n');

fs.mkdirSync('data/a2plus-candidate-lists',{recursive:true});
fs.writeFileSync('data/a2plus-candidate-lists/part-01.txt',part1.text+'\n');
fs.writeFileSync('data/a2plus-candidate-lists/part-02.txt',part2.text+'\n');
fs.writeFileSync('data/a2plus-candidate-lists/part-01-02-unique.txt',combinedText+'\n');
const summary={
  schemaVersion:3,status:'PASS',source:OXFORD_URL,parsedOxfordWords:oxford.size,
  policy:'Oxford A2+ (A2/B1/B2/C1/C2) extraction -> headword dedupe -> remove current dictionary headwords. Oxford-unclassified tokens are retained separately for manual review. No dictionary definitions or production vocabulary data are generated.',
  parts:{part1:{scope:[1,291],...part1.stats},part2:{scope:[292,582],...part2.stats}},
  uniqueOxfordA2PlusAcrossParts1And2:combined.length,
  abusePresentInFinal:combined.some(x=>x.word==='abuse')
};
fs.writeFileSync('data/a2plus-candidate-lists/summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(!summary.abusePresentInFinal) throw new Error('Expected missing dictionary headword "abuse" to be present in final Parts 1+2 candidate list');
