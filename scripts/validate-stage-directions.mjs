import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const fail=message=>{throw new Error(message)};
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const script=read('mousetrap_script_data.json'),stage=read('mousetrap_stage_directions.json');
const scenes=[['act1-scene1',190],['act1-scene2',336],['act2',638]],speechById=new Map();
for(const [sceneId,count] of scenes){
  const rows=script?.[sceneId]?.speeches;
  if(!Array.isArray(rows)||rows.length!==count)fail(`script ${sceneId}: ${rows?.length??0}/${count}`);
  for(const speech of rows){if(!speech?.id||speechById.has(speech.id))fail(`script duplicate/invalid ${speech?.id}`);speechById.set(speech.id,{sceneId,speech})}
}
if(speechById.size!==1164)fail(`script total ${speechById.size}/1164`);
if(stage?.schemaVersion!==1||!Array.isArray(stage.entries))fail('stage schema invalid');
if(stage.counts?.standalone!==5||stage.counts?.attached!==772||stage.counts?.total!==777||stage.counts?.malformedBracketRecovered!==1)fail(`stage declared counts ${JSON.stringify(stage.counts)}`);
if(stage.entries.length!==777)fail(`stage entries ${stage.entries.length}/777`);
const ids=new Set(),placements={before:0,delivery:0,after:0};let standalone=0,attached=0,malformed=0,vocabularyItems=0,noteItems=0;
for(const entry of stage.entries){
  if(!entry||typeof entry!=='object'||!String(entry.id||'').trim()||ids.has(entry.id))fail(`stage duplicate/invalid id ${entry?.id}`);ids.add(entry.id);
  if(!scenes.some(([id])=>id===entry.sceneId))fail(`stage scene ${entry.id}`);
  if(!String(entry.text||'').trim()||!String(entry.summaryJa||'').trim())fail(`stage text/summary ${entry.id}`);
  if(!Array.isArray(entry.sourcePages)||!entry.sourcePages.length||entry.sourcePages.some(page=>!Number.isInteger(page)||page<1||page>84))fail(`stage sourcePages ${entry.id}`);
  if(!Array.isArray(entry.vocabulary)||!entry.vocabulary.length)fail(`stage vocabulary ${entry.id}`);
  for(const item of entry.vocabulary){if(!String(item?.surface||'').trim()||!String(item?.lemma||'').trim()||!String(item?.meaning||'').trim()||!String(item?.note||'').trim())fail(`stage vocabulary invalid ${entry.id}`);vocabularyItems++}
  if(!Array.isArray(entry.notes)||!entry.notes.length||entry.notes.some(note=>!String(note||'').trim()))fail(`stage notes ${entry.id}`);noteItems+=entry.notes.length;
  if(entry.kind==='scene-setting'){
    standalone++;const anchor=entry.anchor,speech=speechById.get(String(anchor?.speechId||''));
    if(!anchor||!['before','after'].includes(anchor.type)||!speech||speech.sceneId!==entry.sceneId||!Number.isInteger(anchor.order))fail(`scene-setting anchor ${entry.id}`);
  }else if(entry.kind==='stage-direction'){
    attached++;const speech=speechById.get(String(entry.speechId||''));
    if(!speech||speech.sceneId!==entry.sceneId||!['before','delivery','after'].includes(entry.placement))fail(`stage speech/placement ${entry.id}`);
    placements[entry.placement]++;if(entry.malformedSourceBracket===true)malformed++;
  }else fail(`stage kind ${entry.id}`);
}
if(standalone!==5||attached!==772||malformed!==1)fail(`stage derived ${standalone}/${attached}/${malformed}`);
if(placements.before!==236||placements.delivery!==411||placements.after!==125)fail(`stage placements ${JSON.stringify(placements)}`);
if(stage.policy?.canonicalSpeechCountUnchanged!==1164||stage.policy?.standaloneAsReaderPages!==true||stage.policy?.attachedAboveTranslation!==true||stage.policy?.practiceSpeechProjectionUnchanged!==true)fail('stage policy invalid');
const runtime='app/src/mousetrap_stage_directions.json';
if(!fs.existsSync(path.join(root,runtime)))fail('runtime stage mirror missing');
if(sha('mousetrap_stage_directions.json')!==sha(runtime))fail('runtime stage mirror SHA mismatch');
console.log(JSON.stringify({status:'PASS',speeches:1164,stageEntries:777,standalone,attached,malformed,placements,vocabularyItems,noteItems,sha256:sha('mousetrap_stage_directions.json')},null,2));
