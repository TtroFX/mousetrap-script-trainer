import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const fail=message=>{throw new Error(message)};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const script=read('mousetrap_script_data.json');
const stage=read('mousetrap_stage_directions.json');
const scenes=[
  {id:'act1-scene1',act:1,scene:1,count:190,stageCount:185},
  {id:'act1-scene2',act:1,scene:2,count:336,stageCount:229},
  {id:'act2',act:2,scene:null,count:638,stageCount:363},
];
const sceneById=new Map(scenes.map(scene=>[scene.id,scene]));
const speechById=new Map();
for(const scene of scenes){
  const rows=script?.[scene.id]?.speeches;
  if(!Array.isArray(rows)||rows.length!==scene.count)fail(`script ${scene.id}: ${rows?.length??0}/${scene.count}`);
  rows.forEach((speech,index)=>{
    const expected=`${scene.id}-speech-${String(index+1).padStart(4,'0')}`;
    if(speech?.id!==expected||speechById.has(speech.id))fail(`script order/duplicate ${speech?.id}`);
    speechById.set(expected,{sceneId:scene.id,ordinal:index+1,speech});
  });
}
if(speechById.size!==1164)fail(`script speech total ${speechById.size}/1164`);
if(stage?.schemaVersion!==2||!Array.isArray(stage.entries))fail('stage schema invalid');
if(stage.source?.pdfSha256!=='94d46d2afe7504d2010c10b3ef4f1017bc3adfe0c09ab86bfd837167357c397b'||stage.source?.pdfPages!==84)fail('stage source authority mismatch');
if(stage.counts?.standalone!==5||stage.counts?.attached!==772||stage.counts?.total!==777||stage.counts?.malformedBracketRecovered!==1)fail(`stage declared counts invalid ${JSON.stringify(stage.counts)}`);
if(stage.entries.length!==777)fail(`stage entries ${stage.entries.length}/777`);
if(stage.policy?.canonicalSpeechCountUnchanged!==1164||stage.policy?.orderedScriptStream!==true||stage.policy?.explicitSourceOrder!==true||stage.policy?.stageDirectionsAreNotSpeeches!==true)fail('stage policy contract invalid');

const allowedCategories=new Set(['scene-setting','entrance','exit','movement','action','delivery','pause','gesture','sound','music','radio','light','curtain']);
const ids=new Set(),placements={before:0,delivery:0,after:0},categories=new Map(),sceneCounts=new Map();
const lastOrder=new Map(),lastPage=new Map();
let standalone=0,attached=0,malformed=0,vocabularyItems=0,noteItems=0;
for(const entry of stage.entries){
  if(!entry||typeof entry!=='object'||!String(entry.id||'').trim()||ids.has(entry.id))fail(`stage duplicate/invalid id ${entry?.id}`);
  ids.add(entry.id);
  const scene=sceneById.get(entry.sceneId);
  if(!scene||entry.act!==scene.act||entry.scene!==scene.scene)fail(`stage scene association ${entry.id}`);
  const expectedOrder=(lastOrder.get(entry.sceneId)||0)+1;
  if(entry.sourceOrder!==expectedOrder)fail(`stage order inversion ${entry.id}: ${entry.sourceOrder}/${expectedOrder}`);
  lastOrder.set(entry.sceneId,entry.sourceOrder);
  const firstPage=Math.min(...(entry.sourcePages||[]));
  if(!Number.isInteger(firstPage)||firstPage<1||firstPage>84||firstPage<(lastPage.get(entry.sceneId)||0))fail(`stage source page order ${entry.id}`);
  lastPage.set(entry.sceneId,firstPage);
  if(!String(entry.text||'').trim()||!String(entry.summaryJa||'').trim())fail(`stage text/summary ${entry.id}`);
  if(!allowedCategories.has(entry.category))fail(`stage category ${entry.id}`);
  categories.set(entry.category,(categories.get(entry.category)||0)+1);
  sceneCounts.set(entry.sceneId,(sceneCounts.get(entry.sceneId)||0)+1);
  if(!Array.isArray(entry.vocabulary)||!entry.vocabulary.length)fail(`stage vocabulary missing ${entry.id}`);
  for(const item of entry.vocabulary){
    if(!String(item?.surface||'').trim()||!String(item?.lemma||'').trim()||!String(item?.meaning||'').trim()||!String(item?.note||'').trim())fail(`stage vocabulary invalid ${entry.id}`);
    vocabularyItems+=1;
  }
  if(!Array.isArray(entry.notes)||!entry.notes.length||entry.notes.some(note=>!String(note||'').trim()))fail(`stage notes ${entry.id}`);
  noteItems+=entry.notes.length;
  if(entry.kind==='scene-setting'){
    standalone+=1;
    const anchorSpeech=speechById.get(String(entry.anchor?.speechId||''));
    if(!anchorSpeech||anchorSpeech.sceneId!==entry.sceneId||!['before','after'].includes(entry.anchor?.type)||!Number.isInteger(entry.anchor?.order))fail(`scene-setting anchor ${entry.id}`);
    if(entry.category!=='scene-setting')fail(`scene-setting category ${entry.id}`);
  }else if(entry.kind==='stage-direction'){
    attached+=1;
    const anchorSpeech=speechById.get(String(entry.speechId||''));
    if(!anchorSpeech||anchorSpeech.sceneId!==entry.sceneId||!['before','delivery','after'].includes(entry.placement))fail(`stage speech/placement ${entry.id}`);
    if(entry.anchor?.speechId!==entry.speechId||entry.anchor?.type!==entry.placement)fail(`stage normalized anchor ${entry.id}`);
    const expectedDelta=entry.placement==='before'?1:0;
    if(!Number.isInteger(entry.sourceSpeakerOrdinal)||anchorSpeech.ordinal-entry.sourceSpeakerOrdinal!==expectedDelta)fail(`stage source anchor ${entry.id}`);
    placements[entry.placement]+=1;
    if(entry.malformedSourceBracket===true)malformed+=1;
  }else fail(`stage kind ${entry.id}`);
}
if(standalone!==5||attached!==772||malformed!==1)fail(`stage derived counts ${standalone}/${attached}/${malformed}`);
if(placements.before!==236||placements.delivery!==411||placements.after!==125)fail(`stage placement counts ${JSON.stringify(placements)}`);
for(const scene of scenes)if(sceneCounts.get(scene.id)!==scene.stageCount)fail(`stage scene count ${scene.id}: ${sceneCounts.get(scene.id)}/${scene.stageCount}`);
for(const category of allowedCategories)if(!categories.get(category))fail(`stage category coverage missing ${category}`);

console.log(JSON.stringify({
  status:'PASS',speeches:1164,speechIdSequence:'PASS',stageEntries:777,
  duplicateStageIds:0,brokenAnchors:0,orderInversions:0,invalidSceneAssociations:0,
  standalone,attached,malformedRecovered:malformed,placements,
  scenes:Object.fromEntries(sceneCounts),categories:Object.fromEntries(categories),
  vocabularyItems,noteItems,pdfSha256:stage.source.pdfSha256,
},null,2));
