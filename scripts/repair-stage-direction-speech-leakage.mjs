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
const stageMatches=(stage.entries||[]).filter(e=>String(e?.text||'').trim()===STAGE_TEXT);
if(stageMatches.length!==1)fail(`stage-direction text match count ${stageMatches.length}/1; matches=${JSON.stringify(stageMatches)}`);
const recovered=stageMatches[0];
if(recovered.speechId!==TARGET_ID||recovered.placement!=='after')fail(`wrong recovered stage anchor: ${JSON.stringify(recovered)}`);
const malformed=(stage.entries||[]).filter(e=>e?.malformedSourceBracket===true);
if(malformed.length!==1)fail(`declared malformed stage-direction count ${malformed.length}/1`);

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
  schemaVersion:1,
  status:'PASS',
  issue:'stage-direction text leaked into canonical spoken text',
  repairedSpeech:{id:TARGET_ID,before:BAD,after:GOOD},
  recoveredStageDirection:{id:recovered.id,text:STAGE_TEXT,speechId:recovered.speechId,placement:recovered.placement,malformedSourceBracket:recovered.malformedSourceBracket===true},
  existingMalformedFlaggedEntries:malformed.map(e=>({id:e.id,text:e.text,speechId:e.speechId,placement:e.placement})),
  speechDelimiterAudit:{speechCount:speeches.length,beforeCount:beforeLeaks.length,unexpectedBeforeCount:unexpectedBefore.length,afterCount:afterLeaks.length},
  removedLineVocabularyEntries:removedVocabulary,
  canonicalSpeechSha256:sha('mousetrap_script_data.json')
};
write('data/stage-direction-speech-leakage-audit.json',report);
console.log(JSON.stringify(report,null,2));
