import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const appDir=process.cwd(),rootDir=path.resolve(appDir,'..'),args=process.argv.slice(2);
const arg=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null};
const verifyOnly=args.includes('--verify-only');
const outDir=path.resolve(arg('--out-dir')||path.join(appDir,'dist'));
const fail=message=>{throw new Error(message)};
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const copy=(src,dst)=>{fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst)};
const copyDir=(src,dst)=>{for(const entry of fs.readdirSync(src,{withFileTypes:true})){const a=path.join(src,entry.name),b=path.join(dst,entry.name);entry.isDirectory()?copyDir(a,b):copy(a,b)}};

const version=readJson(path.join(appDir,'pwa-version.json'));
if(version.schemaVersion!==2||version.runtime!=='index-zero'||!String(version.buildId||''))fail('pwa-version invalid');
const contract=readJson(path.join(rootDir,'data/canonical-production-contract.json'));
if(contract.schemaVersion!==1||!Array.isArray(contract.files)||contract.files.length!==5)fail('canonical contract invalid');
for(const item of contract.files){const file=path.join(rootDir,item.path);if(!fs.existsSync(file))fail(`missing canonical ${item.path}`);if(sha(file)!==item.sha256)fail(`canonical SHA mismatch ${item.path}`)}

const scenes=[['act1-scene1',190],['act1-scene2',336],['act2',638]];
const scriptPath=path.join(rootDir,'mousetrap_script_data.json');
const script=readJson(scriptPath);
let speeches=0;const expectedIds=[];
for(const[id,count]of scenes){const rows=script[id]?.speeches;if(!Array.isArray(rows)||rows.length!==count)fail(`script ${id} count`);rows.forEach((row,i)=>{const expected=`${id}-speech-${String(i+1).padStart(4,'0')}`;if(row?.id!==expected||!row?.speaker||!row?.text)fail(`script ${id} #${i+1}`);expectedIds.push(expected)});speeches+=rows.length}
if(speeches!==1164)fail('script total');
const speechScene=new Map();
for(const [sceneId] of scenes)for(const speech of script[sceneId].speeches)speechScene.set(speech.id,sceneId);
const stagePath=path.join(rootDir,'mousetrap_stage_directions.json');
const stageRuntimePath=path.join(appDir,'src/mousetrap_stage_directions.json');
if(!fs.existsSync(stagePath)||!fs.existsSync(stageRuntimePath)||sha(stagePath)!==sha(stageRuntimePath))fail('canonical/runtime stage directions differ');
const stageDirections=readJson(stagePath);
if(stageDirections.schemaVersion!==2||stageDirections.entries?.length!==778||stageDirections.counts?.standalone!==5||stageDirections.counts?.attached!==773||stageDirections.counts?.total!==778)fail('stage direction schema/counts invalid');
if(stageDirections.policy?.canonicalSpeechCountUnchanged!==1164||stageDirections.policy?.orderedScriptStream!==true||stageDirections.policy?.explicitSourceOrder!==true||stageDirections.policy?.stageDirectionsAreNotSpeeches!==true)fail('stage direction policy invalid');
if(stageDirections.policy?.attachedAboveTranslation!==false||stageDirections.policy?.summaryJaKind!=='minimal-paraphrase'||stageDirections.policy?.summaryJaMaxChars!==64||stageDirections.policy?.readerShowsJapaneseFirst!==true||stageDirections.policy?.lineDetailStageLayout!=='actor-cues-before-translation; remainder-collapsed-after-structure')fail('stage Japanese-first policy invalid');
const stageIds=new Set(),stageSceneCounts=new Map(),stageCategories=new Map();
let stageStandalone=0,stageAttached=0,stageActorCues=0;
for(const entry of stageDirections.entries){
  const expectedOrder=(stageSceneCounts.get(entry.sceneId)||0)+1;
  const anchorSpeech=String(entry.anchor?.speechId||'');
  if(!entry?.id||stageIds.has(entry.id)||entry.sourceOrder!==expectedOrder||speechScene.get(anchorSpeech)!==entry.sceneId||!String(entry.text||'').trim()||!String(entry.category||'').trim())fail(`stage direction invalid ${entry?.id||'unknown'}`);
  const summaryJa=String(entry.summaryJa||'').trim();
  if(!summaryJa||[...summaryJa].length>64||!/[぀-ヿ㐀-鿿]/.test(summaryJa)||/[a-z]{2,}/.test(summaryJa)||/ト書き|指定|補足|説明|ます/.test(summaryJa)||typeof entry.actorCueForSpeech!=='boolean')fail(`stage Japanese paraphrase invalid ${entry.id}`);
  if(entry.actorCueForSpeech)stageActorCues++;
  if(entry.kind==='scene-setting'&&!entry.actorCueForSpeech)stageStandalone++;
  else if(entry.kind==='stage-direction'&&entry.speechId===anchorSpeech&&entry.placement===entry.anchor?.type&&(entry.placement!=='delivery'||entry.actorCueForSpeech))stageAttached++;
  else fail(`stage direction kind/anchor invalid ${entry.id}`);
  stageIds.add(entry.id);stageSceneCounts.set(entry.sceneId,entry.sourceOrder);stageCategories.set(entry.category,(stageCategories.get(entry.category)||0)+1);
}
if(stageStandalone!==5||stageAttached!==773||stageActorCues!==612||[...stageSceneCounts.values()].join(',')!=='185,230,363')fail('stage direction derived counts/order invalid');
const translations=readJson(path.join(rootDir,'mousetrap_line_translations.json'));
const vocabulary=readJson(path.join(rootDir,'mousetrap_line_vocabulary.json'));
const grammar=readJson(path.join(rootDir,'mousetrap_line_grammar.json'));
const dictionary=readJson(path.join(rootDir,'mousetrap_word_dictionary.json'));
if(Object.keys(translations).length!==1164||Object.keys(vocabulary).length!==1164||Object.keys(grammar).length!==1164||Object.keys(dictionary).length<578)fail('canonical coverage counts invalid');
const vocabItems=Object.values(vocabulary).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0);
const grammarItems=Object.values(grammar).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0);
if(vocabItems<1186||grammarItems!==692)fail('annotation item counts invalid');
let vocabularyDisplayed=0,vocabularyNeutralOnly=0;
for(const [lineId,rows] of Object.entries(vocabulary)){if(!Array.isArray(rows))fail(`vocabulary ${lineId}: array required`);const seen=new Set();for(const entry of rows){const surface=String(entry?.surface||'').trim(),lemma=String(entry?.lemma||'').trim(),meaning=String(entry?.meaning||'').trim();if(!surface||!lemma||!meaning||typeof entry.playMeaning!=='boolean')fail(`vocabulary ${lineId}: invalid entry`);const key=`${surface.toLowerCase()}\u0000${lemma.toLowerCase()}`;if(seen.has(key))fail(`vocabulary ${lineId}: duplicate ${surface}/${lemma}`);seen.add(key);entry.playMeaning?vocabularyDisplayed++:vocabularyNeutralOnly++;}}
if(vocabularyDisplayed+vocabularyNeutralOnly!==vocabItems)fail(`vocabulary presentation counts invalid (${vocabularyDisplayed}/${vocabularyNeutralOnly} vs ${vocabItems})`);
const dictionaryKeys=new Set(Object.keys(dictionary).map(x=>x.trim().toLowerCase()));
const dictionaryByKey=new Map(Object.entries(dictionary).map(([key,entry])=>[key.trim().toLowerCase(),entry]));
for(const [lemma,entry] of Object.entries(dictionary)){if(!entry||typeof entry!=='object'||!String(entry.meaning||'').trim()||!String(entry.coreMeaning||'').trim())fail(`invalid dictionary ${lemma}`);if(String(entry.meaning).trim()!==String(entry.coreMeaning).trim())fail(`dictionary coreMeaning mismatch: ${lemma}`);if(Object.prototype.hasOwnProperty.call(entry,'contextMeaning')||Object.prototype.hasOwnProperty.call(entry,'contextExplanation'))fail(`dictionary play-context field forbidden: ${lemma}`);if(Object.prototype.hasOwnProperty.call(entry,'pattern')||Object.prototype.hasOwnProperty.call(entry,'patternDesc'))fail(`dictionary Pattern fields forbidden: ${lemma}`);}
for(const [lineId,rows] of Object.entries(vocabulary))for(const entry of rows){const key=String(entry.lemma||'').trim().toLowerCase();const d=dictionaryByKey.get(key);if(!d)fail(`missing dictionary lemma ${entry.lemma}`);if(String(entry.meaning||'').trim()!==String(d.meaning||'').trim())fail(`vocabulary/dictionary meaning mismatch ${lineId}: ${entry.lemma}`);if(Object.prototype.hasOwnProperty.call(entry,'inThisPlay')){const t=String(entry.inThisPlay||'').trim();if(typeof entry.inThisPlay!=='string'||!t||t.length>360||t===String(entry.meaning||'').trim())fail(`invalid inThisPlay ${lineId}: ${entry.lemma}`);}}

const interpretationKinds=new Set(['context','reaction','emotion','tone','joke','dramatic','reference','foreshadowing','truth','lie','concealment','feignedIgnorance','misdirection','evasion','mistakenBelief']);
const interpretation={};let interpretationSpeeches=0,interpretationNotes=0;
for(const[sceneId,count]of scenes){
  const src=readJson(path.join(rootDir,'data/interpretation',`${sceneId}.json`));
  const ids=script[sceneId].speeches.map(x=>x.id);
  if(src.schemaVersion!==1||src.sceneId!==sceneId||src.scope?.speechCount!==count)fail(`interpretation ${sceneId}: schema/scope`);
  if(src.policy?.allSpeechesReviewed!==true||src.policy?.interpretationOptional!==true||src.policy?.fullPlayTruthAllowed!==true)fail(`interpretation ${sceneId}: policy`);
  if(src.qa?.truthAwareReview!=='PASS'||src.qa?.fullPlayTruthChecked!==true)fail(`interpretation ${sceneId}: truth-aware QA`);
  if(!Array.isArray(src.reviewedSpeechIds)||src.reviewedSpeechIds.length!==count||src.reviewedSpeechIds.some((id,i)=>id!==ids[i]))fail(`interpretation ${sceneId}: reviewed IDs`);
  for(const id of ids){
    const notes=src.interpretations?.[id]||[];
    if(!Array.isArray(notes))fail(`interpretation ${id}: array`);
    const seen=new Set();
    for(const note of notes){const kind=String(note?.kind||''),text=String(note?.text||'').trim();if(!interpretationKinds.has(kind)||!text||text.length>360)fail(`interpretation ${id}: invalid note`);const key=`${kind}\u0000${text}`;if(seen.has(key))fail(`interpretation ${id}: duplicate note`);seen.add(key)}
    interpretation[id]=notes.map(({kind,text})=>({kind,text:String(text).trim()}));
    if(notes.length){interpretationSpeeches++;interpretationNotes+=notes.length}
  }
}
if(Object.keys(interpretation).length!==1164||Object.keys(interpretation).some((id,i)=>id!==expectedIds[i]))fail('interpretation production coverage/order');

const structurePath=path.join(appDir,'mousetrap_line_structure.json');
if(!fs.existsSync(structurePath))fail('canonical chunking structure missing');
const structure=readJson(structurePath);
if(structure.schemaVersion!==2||structure.ruleSet!=='chunking-v1')fail('chunking-v1 structure schema required');
if('rawLines' in structure)fail('legacy structure fallback forbidden');
if(structure.sourceSha256!==sha(scriptPath))fail('structure/script SHA mismatch');
if(structure.counts?.speeches!==1164||structure.counts?.sentences!==2334||structure.counts?.clauses!==2938||structure.counts?.chunks!==11807)fail('chunking-v1 count contract invalid');
if(!structure.lines||Object.keys(structure.lines).length!==1164)fail('chunking-v1 speech coverage invalid');
if(Object.keys(structure.lines).some((id,i)=>id!==expectedIds[i]))fail('chunking-v1 speech order invalid');
for(const line of Object.values(structure.lines))for(const sentence of line.sentences||[])for(const chunk of sentence.chunks||[]){const marker=String(chunk.marker||'');if(marker.startsWith('Vi')||marker.startsWith('Vt')||marker.includes('VBN')||/^HV\d/.test(marker))fail(`legacy chunk marker ${marker}`)}

const required=['index.html','manifest.webmanifest','sw.js','offline.html','pwa-version.json'];
for(const file of required)if(!fs.existsSync(path.join(appDir,file)))fail(`missing runtime ${file}`);
for(const file of ['src/app.css','src/focus-mode.css','src/stage-directions.css','src/config.js','src/data-store.js','src/state-store.js','src/resume-bookmarks.js','src/gesture-controls.js','src/main.js','src/stage-directions.js','src/mousetrap_stage_directions.json','src/study/study.css','src/study/structure-model.js','src/study/structure-view.js','src/study/dictionary-sheet.js'])if(!fs.existsSync(path.join(appDir,file)))fail(`missing module ${file}`);
const legacy=['p5_app.js','reader_sheet.js','practice_navigation.js','p6_private_data.js','p6_pwa.js','p6_pwa.css','P2_learning.html','008_cue_practice_P3.html','009_rehearsal_P4.html'];

if(!verifyOnly){
  fs.rmSync(outDir,{recursive:true,force:true});fs.mkdirSync(outDir,{recursive:true});
  for(const file of required)copy(path.join(appDir,file),path.join(outDir,file));
  copyDir(path.join(appDir,'src'),path.join(outDir,'src'));copyDir(path.join(appDir,'icons'),path.join(outDir,'icons'));
  copy(structurePath,path.join(outDir,'mousetrap_line_structure.json'));
  for(const item of contract.files){const src=path.join(rootDir,item.path),dst=path.join(outDir,item.path);copy(src,dst);if(sha(src)!==sha(dst))fail(`artifact SHA mismatch ${item.path}`)}
  const interpretationPath=path.join(outDir,'mousetrap_line_interpretation.json');
  fs.writeFileSync(interpretationPath,JSON.stringify(interpretation,null,2)+'\n');
  for(const file of legacy)if(fs.existsSync(path.join(outDir,file)))fail(`legacy runtime leaked ${file}`);
  const files=Object.fromEntries(contract.files.map(item=>[item.path,sha(path.join(outDir,item.path))]));
  files['mousetrap_line_interpretation.json']=sha(interpretationPath);
  files['mousetrap_line_structure.json']=sha(path.join(outDir,'mousetrap_line_structure.json'));
  files['src/mousetrap_stage_directions.json']=sha(path.join(outDir,'src/mousetrap_stage_directions.json'));
  fs.writeFileSync(path.join(outDir,'production-bundle.json'),JSON.stringify({schemaVersion:2,buildId:version.buildId,runtime:'index-zero',verifiedAt:new Date().toISOString(),qa:{speeches:1164,translations:1164,interpretationCoverage:1164,interpretationSpeeches,interpretationNotes,vocabulary:vocabItems,vocabularyDisplayed,vocabularyNeutralOnly,grammar:grammarItems,dictionary:Object.keys(dictionary).length,structureSentences:2334,structureClauses:2938,structureChunks:11807,stageDirections:778,stageStandalone,stageAttached,stageActorCues,stageJapaneseParaphrases:778,stageCategories:Object.fromEntries(stageCategories)},files},null,2)+'\n');
}
console.log(JSON.stringify({status:'PASS',runtime:'index-zero',buildId:version.buildId,mode:verifyOnly?'verify-only':'assembled',qa:{speeches:1164,translations:1164,interpretationCoverage:1164,interpretationSpeeches,interpretationNotes,vocabulary:vocabItems,vocabularyDisplayed,vocabularyNeutralOnly,grammar:grammarItems,dictionary:Object.keys(dictionary).length,structureSentences:2334,structureClauses:2938,structureChunks:11807,stageDirections:778,stageStandalone,stageAttached,stageActorCues,stageJapaneseParaphrases:778,stageCategories:Object.fromEntries(stageCategories)}},null,2));
