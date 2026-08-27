import fs from 'node:fs';
const fail=message=>{throw new Error(message)};
const index=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');

if(!index.includes("navigator.serviceWorker.register('./sw.js'"))fail('Service Worker registration is missing');
if(!index.includes('window.MTS_PWA_READY'))fail('PWA readiness promise is missing');
if(!sw.includes("const BUILD_ID='index-zero-2026-08-27-r9'"))fail('Offline cache build id was not bumped');
if(!sw.includes('precacheRequired(SHELL_CACHE,SHELL)'))fail('Shell is not mandatory-precache');
if(!sw.includes('precacheRequired(DATA_CACHE,DATA_ASSETS)'))fail('Canonical data is not mandatory-precache');
if(!sw.includes('await Promise.all(['))fail('Precache completion is not awaited');
if(sw.includes('Promise.allSettled(SHELL'))fail('Shell precache must not silently accept missing assets');

const required=[
  './index.html','./src/app.css','./src/config.js','./src/data-store.js','./src/state-store.js','./src/resume-bookmarks.js','./src/gesture-controls.js','./src/main.js','./src/study/study.css','./src/study/structure-model.js','./src/study/structure-view.js','./src/study/dictionary-sheet.js','./manifest.webmanifest','./offline.html',
  'mousetrap_script_data.json','mousetrap_line_translations.json','mousetrap_line_interpretation.json','mousetrap_line_vocabulary.json','mousetrap_line_grammar.json','mousetrap_word_dictionary.json','mousetrap_line_structure.json'
];
for(const asset of required)if(!sw.includes(`'${asset}'`))fail(`Required offline asset missing from Service Worker: ${asset}`);
console.log(`PASS offline PWA static contract (${required.length} required assets)`);
