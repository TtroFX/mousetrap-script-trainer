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
if(stage.policy?.attachedAboveTranslation!==false||stage.policy?.summaryJaKind!=='minimal-paraphrase'||stage.policy?.summaryJaMaxChars!==64||stage.policy?.readerShowsJapaneseFirst!==true||stage.policy?.lineDetailStageLayout!=='actor-cues-before-translation; remainder-collapsed-after-structure')fail('Japanese-first stage policy invalid');
if(JSON.stringify(stage)!==JSON.stringify(runtime))fail('runtime stage mirror differs from canonical');
const sceneCounts=new Map(),ids=new Set();let actorCues=0;
for(const entry of stage.entries){
  const expected=(sceneCounts.get(entry.sceneId)||0)+1;
  if(!entry.id||ids.has(entry.id)||entry.sourceOrder!==expected||!entry.category||!entry.anchor?.speechId)fail(`invalid canonical entry ${entry.id}`);
  const summary=String(entry.summaryJa||'').trim();
  if(!summary||[...summary].length>64||!/[぀-ヿ㐀-鿿]/.test(summary)||/[a-z]{2,}/.test(summary)||/ト書き|指定|補足|説明|ます/.test(summary))fail(`invalid Japanese paraphrase ${entry.id}`);
  if(typeof entry.actorCueForSpeech!=='boolean')fail(`invalid actor cue flag ${entry.id}`);
  if(entry.actorCueForSpeech)actorCues+=1;
  if(entry.kind==='scene-setting'&&entry.actorCueForSpeech)fail(`scene setting actor cue ${entry.id}`);
  if(entry.placement==='delivery'&&!entry.actorCueForSpeech)fail(`delivery actor cue missing ${entry.id}`);
  if(entry.kind==='stage-direction'&&(entry.anchor.type!==entry.placement||entry.anchor.speechId!==entry.speechId))fail(`invalid normalized anchor ${entry.id}`);
  ids.add(entry.id);sceneCounts.set(entry.sceneId,entry.sourceOrder);
}
if([...sceneCounts.values()].join(',')!=='185,229,363')fail('stage scene counts/order invalid');
if(actorCues!==611)fail(`actor cue count ${actorCues}/611`);
if(!config.includes("stageDirections: './src/mousetrap_stage_directions.json'")||!config.includes('STAGE_TIMEOUT_MS'))fail('stage DataStore config missing');
for(const token of ['loadStageDirections','validateStageDirections','getReaderSequence','getStageDirectionsForSpeech','readerSequenceByScene'])if(!dataStore.includes(token))fail(`DataStore stage API missing ${token}`);
if(!stateStore.includes('stageDirectionsVisible()')||!stateStore.includes('setStageDirectionsVisible(visible)'))fail('practice visibility persistence missing');
if(!index.includes('./src/stage-directions.js')||!index.includes('./src/stage-directions.css'))fail('stage runtime not loaded from index');
for(const asset of ['./src/stage-directions.js','./src/stage-directions.css','src/mousetrap_stage_directions.json'])if(!sw.includes(`'${asset}'`))fail(`precache missing ${asset}`);
const configBuild=config.match(/BUILD_ID = '([^']+)'/)?.[1];
const swBuild=sw.match(/const BUILD_ID='([^']+)'/)?.[1];
if(!configBuild||configBuild!==swBuild||configBuild!==version.buildId||version.dataVersion!=='canonical-2026-08-30-stage-directions-ja-v3')fail(`release PWA metadata inconsistent (${configBuild}/${swBuild}/${version.buildId}/${version.dataVersion})`);
for(const token of ['dataset.stageReader','dataset.stageActorCues','dataset.stageContextDetails','data-stage-reveal','data-stage-page','data-stage-visibility','data-practice-stage','data-stage-search-results','getReaderSequence'])if(!module.includes(token))fail(`stage runtime contract missing ${token}`);
const readerSource=module.slice(module.indexOf('function readerRow'),module.indexOf('function enhanceScriptList'));
if(/Stage direction|Open context|stage-context-link/.test(readerSource))fail('Script reader stage notes contain forbidden labels/actions');
if(/\bfetch\s*\(/.test(module))fail('stage runtime must consume DataStore, not fetch directly');
for(const token of ['.stage-original','.stage-direction-card','.stage-reader-row','.stage-note-ja','.stage-note-en[hidden]','.stage-actor-cues','.stage-context-details','.stage-situation-page','.practice-stage-toggle','user-select:text','overflow-wrap:anywhere'])if(!css.includes(token))fail(`stage style contract missing ${token}`);
if(/apply-stage-directions-integration|stage-directions-integrate/.test(index+module+sw))fail('source-mutation integration leaked into production');

console.log(JSON.stringify({status:'PASS',schemaVersion:2,stageEntries:777,standalone:5,attached:772,actorCues,japaneseParaphrases:777,readerStream:true,lineDetail:true,practice:true,search:true,offline:true,buildId:version.buildId},null,2));
