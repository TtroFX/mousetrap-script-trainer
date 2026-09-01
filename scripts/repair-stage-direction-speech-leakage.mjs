import fs from 'node:fs';
import crypto from 'node:crypto';

const TARGET_ID='act1-scene2-speech-0308';
const BAD='Ah. {He moves above the sofa table.)';
const GOOD='Ah.';
const STAGE_TEXT='He moves above the sofa table.';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const fail=m=>{throw new Error(m)};
const clone=v=>JSON.parse(JSON.stringify(v));

const script=read('mousetrap_script_data.json');
const speeches=['act1-scene1','act1-scene2','act2'].flatMap(scene=>script[scene]?.speeches||[]);
if(speeches.length!==1164)fail(`speech total ${speeches.length}/1164`);
const beforeLeaks=speeches.filter(s=>/[\[\]{}]/.test(String(s.text||'')));
const unexpectedBefore=beforeLeaks.filter(s=>s.id!==TARGET_ID||s.text!==BAD);
if(unexpectedBefore.length)fail(`unexpected stage-delimiter text in speeches: ${JSON.stringify(unexpectedBefore.map(s=>({id:s.id,text:s.text})))}`);
const target=speeches.find(s=>s.id===TARGET_ID);
if(!target)fail(`missing ${TARGET_ID}`);
if(target.text!==BAD&&target.text!==GOOD)fail(`${TARGET_ID}: unexpected text ${JSON.stringify(target.text)}`);
target.text=GOOD;
const afterLeaks=speeches.filter(s=>/[\[\]{}]/.test(String(s.text||'')));
if(afterLeaks.length)fail(`stage delimiters remain in spoken text: ${JSON.stringify(afterLeaks.map(s=>({id:s.id,text:s.text})))}`);
write('mousetrap_script_data.json',script);

const stage=read('mousetrap_stage_directions.json');
const entries=stage.entries||[];
const sameText=entries.filter(e=>String(e?.text||'').trim()===STAGE_TEXT);
let recovered=entries.find(e=>e?.speechId===TARGET_ID&&e?.placement==='after'&&String(e?.text||'').trim()===STAGE_TEXT);
if(!recovered){
  const template=sameText.find(e=>e?.placement==='after')||sameText[0];
  if(!template)fail('no schema-compatible template exists for recovered movement cue');
  recovered=clone(template);
  Object.assign(recovered,{
    id:'sd-act1-scene2-recovered-0308',
    sceneId:'act1-scene2',kind:'stage-direction',speechId:TARGET_ID,placement:'after',
    text:STAGE_TEXT,summaryJa:'彼がソファテーブルの奥側へ移動する。',sourcePages:[40],sourceSpeakerOrdinal:308,
    malformedSourceBracket:true,act:1,scene:2,sourceOrder:0,category:'movement',actorCueForSpeech:true,
    anchor:{type:'after',speechId:TARGET_ID,order:0}
  });
  entries.push(recovered);
}
if(entries.filter(e=>e?.speechId===TARGET_ID&&String(e?.text||'').trim()===STAGE_TEXT).length!==1)fail('duplicate recovered stage cue at target speech');
for(const entry of entries)entry.malformedSourceBracket=(entry===recovered);
stage.counts={...stage.counts,
  standalone:entries.filter(e=>e.kind==='scene-setting').length,
  attached:entries.filter(e=>e.kind==='stage-direction').length,
  total:entries.length,
  malformedBracketRecovered:entries.filter(e=>e.malformedSourceBracket===true).length
};
stage.entries=entries;
write('mousetrap_stage_directions.json',stage);

const translations=read('mousetrap_line_translations.json');
if(translations[TARGET_ID]?.translation!=='ああ。')fail(`${TARGET_ID}: translation is not the spoken line translation`);
const grammar=read('mousetrap_line_grammar.json');
if(!Array.isArray(grammar[TARGET_ID])||grammar[TARGET_ID].length!==0)fail(`${TARGET_ID}: grammar should be empty for Ah.`);
const vocabulary=read('mousetrap_line_vocabulary.json');
if(!Array.isArray(vocabulary[TARGET_ID]))fail(`${TARGET_ID}: vocabulary row missing`);
const removedVocabulary=vocabulary[TARGET_ID].length;
vocabulary[TARGET_ID]=[];
write('mousetrap_line_vocabulary.json',vocabulary);

const report={
  schemaVersion:1,status:'PASS',issue:'stage-direction text leaked into canonical spoken text and was absent from its correct stage anchor',
  repairedSpeech:{id:TARGET_ID,before:BAD,after:GOOD},
  recoveredStageDirection:{id:recovered.id,text:STAGE_TEXT,speechId:recovered.speechId,placement:recovered.placement,sourcePages:recovered.sourcePages,malformedSourceBracket:true},
  stageCounts:stage.counts,
  speechDelimiterAudit:{speechCount:speeches.length,beforeCount:beforeLeaks.length,unexpectedBeforeCount:unexpectedBefore.length,afterCount:afterLeaks.length},
  removedLineVocabularyEntries:removedVocabulary,
  canonicalSpeechSha256:sha('mousetrap_script_data.json')
};
write('data/stage-direction-speech-leakage-audit.json',report);
console.log(JSON.stringify(report,null,2));
