import fs from 'node:fs';
const fail=message=>{throw new Error(message)};
const index=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const config=fs.readFileSync('src/config.js','utf8');
const main=fs.readFileSync('src/main.js','utf8');
const version=JSON.parse(fs.readFileSync('pwa-version.json','utf8'));

if(!index.includes("navigator.serviceWorker.register('./sw.js'"))fail('Service Worker registration is missing');
if(!index.includes('window.MTS_PWA_READY'))fail('PWA readiness promise is missing');
if(!index.includes('./src/speech-controller.js'))fail('Speech controller is not booted from index.html');
const swBuild=sw.match(/const BUILD_ID='([^']+)'/)?.[1];
const configBuild=config.match(/BUILD_ID = '([^']+)'/)?.[1];
if(!swBuild||swBuild!==configBuild||swBuild!==version.buildId)fail(`PWA build ids are inconsistent (${swBuild}/${configBuild}/${version.buildId})`);
if(!sw.includes('precacheRequired(SHELL_CACHE,SHELL)'))fail('Shell is not mandatory-precache');
if(!sw.includes('precacheRequired(DATA_CACHE,DATA_ASSETS)'))fail('Canonical data is not mandatory-precache');
if(!sw.includes('await Promise.all(['))fail('Precache completion is not awaited');
if(sw.includes('Promise.allSettled(SHELL'))fail('Shell precache must not silently accept missing assets');
if(!main.includes("from './pdf-pages.js'"))fail('main.js does not import the pure PDF page mapping module');
if(index.includes('pdf-page-badges.js'))fail('legacy PDF page observer entrypoint remains in index.html');
if(!index.includes('./src/pdf-pages.css'))fail('PDF page layout stylesheet is not loaded');

const required=[
  './index.html','./src/app.css','./src/pdf-pages.css','./src/focus-mode.css','./src/stage-directions.css','./src/config.js','./src/data-store.js','./src/state-store.js','./src/resume-bookmarks.js','./src/speech-controller.js','./src/gesture-controls.js','./src/main.js','./src/pdf-pages.js','./src/stage-directions.js','./src/study/study.css','./src/study/structure-model.js','./src/study/structure-view.js','./src/study/dictionary-sheet.js','./manifest.webmanifest','./offline.html',
  'mousetrap_script_data.json','mousetrap_line_translations.json','mousetrap_line_interpretation.json','mousetrap_line_vocabulary.json','mousetrap_line_grammar.json','mousetrap_word_dictionary.json','mousetrap_line_structure.json','src/mousetrap_stage_directions.json'
];
for(const asset of required)if(!sw.includes(`'${asset}'`))fail(`Required offline asset missing from Service Worker: ${asset}`);
console.log(`PASS offline PWA static contract (${required.length} required assets, ${swBuild})`);
