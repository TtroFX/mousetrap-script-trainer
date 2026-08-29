import fs from 'node:fs';
import path from 'node:path';

const appDir=process.cwd(),root=path.resolve(appDir,'..');
const text=file=>fs.readFileSync(path.join(appDir,file),'utf8');
const fail=message=>{throw new Error(message)};
const stage=JSON.parse(fs.readFileSync(path.join(root,'mousetrap_stage_directions.json'),'utf8'));
const runtime=JSON.parse(text('src/mousetrap_stage_directions.json'));
const config=text('src/config.js'),dataStore=text('src/data-store.js'),stateStore=text('src/state-store.js');
const index=text('index.html'),sw=text('sw.js'),module=text('src/stage-directions.js'),css=text('src/stage-directions.css');
const version=JSON.parse(text('pwa-version.json'));

if(stage.schemaVersion!==2||stage.entries?.length!==777)fail('stage schema/count invalid');
if(stage.counts?.standalone!==5||stage.counts?.attached!==772||stage.counts?.total!==777)fail('stage declared counts invalid');
if(stage.policy?.canonicalSpeechCountUnchanged!==1164||stage.policy?.orderedScriptStream!==true||stage.policy?.explicitSourceOrder!==true||stage.policy?.stageDirectionsAreNotSpeeches!==true)fail('stage policy invalid');
if(JSON.stringify(stage)!==JSON.stringify(runtime))fail('runtime stage mirror differs from canonical');
const sceneCounts=new Map(),ids=new Set();
for(const entry of stage.entries){
  const expected=(sceneCounts.get(entry.sceneId)||0)+1;
  if(!entry.id||ids.has(entry.id)||entry.sourceOrder!==expected||!entry.category||!entry.anchor?.speechId)fail(`invalid canonical entry ${entry.id}`);
  if(entry.kind==='stage-direction'&&(entry.anchor.type!==entry.placement||entry.anchor.speechId!==entry.speechId))fail(`invalid normalized anchor ${entry.id}`);
  ids.add(entry.id);sceneCounts.set(entry.sceneId,entry.sourceOrder);
}
if([...sceneCounts.values()].join(',')!=='185,229,363')fail('stage scene counts/order invalid');
if(!config.includes("stageDirections: './src/mousetrap_stage_directions.json'")||!config.includes('STAGE_TIMEOUT_MS'))fail('stage DataStore config missing');
for(const token of ['loadStageDirections','validateStageDirections','getReaderSequence','getStageDirectionsForSpeech','readerSequenceByScene'])if(!dataStore.includes(token))fail(`DataStore stage API missing ${token}`);
if(!stateStore.includes('stageDirectionsVisible()')||!stateStore.includes('setStageDirectionsVisible(visible)'))fail('practice visibility persistence missing');
if(!index.includes('./src/stage-directions.js')||!index.includes('./src/stage-directions.css'))fail('stage runtime not loaded from index');
for(const asset of ['./src/stage-directions.js','./src/stage-directions.css','src/mousetrap_stage_directions.json'])if(!sw.includes(`'${asset}'`))fail(`precache missing ${asset}`);
if(version.buildId!=='index-zero-2026-08-29-r16'||version.dataVersion!=='canonical-2026-08-29-stage-directions-v2')fail('release PWA metadata missing');
for(const token of ['dataset.stageReader','dataset.stageDirectionGroup','data-stage-page','data-stage-visibility','data-practice-stage','data-stage-search-results','getReaderSequence'])if(!module.includes(token))fail(`stage runtime contract missing ${token}`);
if(/\bfetch\s*\(/.test(module))fail('stage runtime must consume DataStore, not fetch directly');
for(const token of ['.stage-original','.stage-direction-card','.stage-reader-row','.stage-situation-page','.practice-stage-toggle','user-select:text','overflow-wrap:anywhere'])if(!css.includes(token))fail(`stage style contract missing ${token}`);
if(/apply-stage-directions-integration|stage-directions-integrate/.test(index+module+sw))fail('source-mutation integration leaked into production');

console.log(JSON.stringify({status:'PASS',schemaVersion:2,stageEntries:777,standalone:5,attached:772,readerStream:true,lineDetail:true,practice:true,search:true,offline:true,buildId:version.buildId},null,2));
