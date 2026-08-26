import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const fail=m=>{throw new Error(m)};
const required=['index.html','src/app.css','src/config.js','src/data-store.js','src/state-store.js','src/resume-bookmarks.js','src/gesture-controls.js','src/main.js','sw.js','playwright.index-zero.config.js','tests/index_zero.e2e.spec.js','tests/resume_bookmarks.e2e.spec.js'];
for(const f of required)if(!fs.existsSync(path.join(root,f)))fail(`missing ${f}`);
const legacySource=['p5.css','p5_app.js','reader_sheet.js','practice_navigation.js','p6_private_data.js','p6_pwa.js','p6_pwa.css','P2_learning.html','008_cue_practice_P3.html','009_rehearsal_P4.html','upgrade-r18.html','playwright.config.js','tests/p5.e2e.spec.js','tests/p6.pwa.spec.js','tests/p6_completion_regression.spec.js','tests/p6_static_qa.mjs','tests/startup_smoke.mjs','tests/generate_fixture.mjs','tests/prepare_p6_fixture_contract.mjs'];
for(const f of legacySource)if(fs.existsSync(path.join(root,f)))fail(`legacy source still exists: ${f}`);
const index=read('index.html'),main=read('src/main.js'),data=read('src/data-store.js'),state=read('src/state-store.js'),sw=read('sw.js');
if(!index.includes('type="module" src="./src/main.js"'))fail('index does not boot the new module runtime');
for(const forbidden of ['<iframe','p5_app.js','reader_sheet.js','practice_navigation.js','p6_private_data.js','P2_learning.html','008_cue_practice_P3.html','009_rehearsal_P4.html','Production Data','dataGate'])if(index.includes(forbidden))fail(`legacy dependency in index: ${forbidden}`);
for(const src of [main,data,state])for(const forbidden of ['MTS_PRIVATE_DATA','MTS_SHARED_','MutationObserver','postMessage','dataGate','gateStatus'])if(src.includes(forbidden))fail(`legacy runtime mechanism remains: ${forbidden}`);
if((main.match(/\bfetch\s*\(/g)||[]).length!==0)fail('views/main must not fetch data directly');
if(!data.includes('AbortController')||!data.includes('timeout after'))fail('DataStore timeout/abort contract missing');
for(const term of ['loadCore','loadStudy','loadStructure','getSpeech','getVocabulary','getDictionary'])if(!data.includes(term))fail(`DataStore API missing ${term}`);
for(const term of ['mts.selectedSceneId','mts.characterId','mts.reader.progress','mts.practice.cue.ratings','mts.practice.rehearsal.state','mts.memory.stages','mts.resume.v1','mts.bookmarks.v1'])if(!state.includes(term)&&!read('src/config.js').includes(term))fail(`state compatibility missing ${term}`);
if(!main.includes('Cue Practice')||!main.includes('Rehearsal')||!main.includes('SpeechRecognition')||!main.includes('SpeechSynthesisUtterance'))fail('practice feature parity missing');
if(!main.includes("case'/bookmarks'")||!read('src/resume-bookmarks.js').includes('Continue')||!read('src/resume-bookmarks.js').includes('Bookmarks'))fail('feature parity missing: Resume/Bookmarks');
if(!main.includes('Full')||!main.includes('Mine')||!main.includes('Cue Focus')||!main.includes('Structure')||!main.includes('Grammar / Usage'))fail('reader/study feature parity missing');
if(!sw.includes("'./src/resume-bookmarks.js'"))fail('Resume/Bookmarks runtime is missing from the offline shell cache');
const openPos=sw.indexOf('await timeoutFetch(request)'),cachePos=sw.indexOf('await caches.open(cacheName)');
if(openPos<0||cachePos<0||openPos>cachePos)fail('service worker is not network-first before Cache Storage');
console.log(JSON.stringify({status:'PASS',runtime:'index-zero',iframes:0,directViewFetches:0,dataStore:'single-owner',legacyRuntimeDependencies:0,legacySourceFiles:0,offlineResumeBookmarks:true},null,2));

const uiFiles=['index.html','offline.html','src/main.js','src/resume-bookmarks.js'];for(const f of uiFiles){if(/[ぁ-んァ-ヶ一-龠]/.test(read(f)))fail('non-English hard-coded UI remains in '+f)}
const gestures=read('src/gesture-controls.js'),css=read('src/app.css');if(!main.includes("import './gesture-controls.js'"))fail('gesture module not imported');if(!css.includes('overscroll-behavior-y:none'))fail('pull-to-refresh CSS guard missing');if(!gestures.includes("event.preventDefault()")||!gestures.includes('Quick flick down'))fail('gesture guards missing');if(main.includes('new MutationObserver')||gestures.includes('MutationObserver'))fail('runtime MutationObserver forbidden');if(!main.includes('arrangeLineStudySections')||!main.includes('structure-details'))fail('Line Detail study ordering/collapse missing');

for(const term of ["?line=${encodeURIComponent(line)}",'selected-role-line'])if(!main.includes(term))fail('r5 Script return/role emphasis missing: '+term);const rb5=read('src/resume-bookmarks.js');if(!rb5.includes('home-bookmark-scroll')||!css.includes('max-height:330px'))fail('r5 Home bookmark scroller missing');if(!main.includes("No additional grammar notes.")||!main.includes("No vocabulary entries."))fail('r5 empty study suppression contract missing');
