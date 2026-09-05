import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const fail=message=>{throw new Error(message)};
const read=path=>fs.readFileSync(path,'utf8');
const speech=read('src/speech-controller.js');
const index=read('index.html');
const sw=read('sw.js');

const syntax=spawnSync(process.execPath,['--check','src/speech-controller.js'],{encoding:'utf8'});
if(syntax.status!==0)fail(`speech-controller.js syntax error: ${syntax.stderr||syntax.stdout}`);

for(const token of [
  "const DEFAULT_LANG = 'en-GB'",
  'SpeechSynthesisUtterance',
  'getVoices',
  'voiceschanged',
  'localService',
  'preferredVoice',
  'speechSynthesis',
  "window.addEventListener('hashchange'",
  "window.addEventListener('pagehide'",
  'window.MTS_SPEECH = speechController',
]) if(!speech.includes(token)) fail(`speech controller contract missing: ${token}`);

if(!index.includes('<script type="module" src="./src/speech-controller.js"></script>'))fail('speech controller is not booted before app runtime');
if(index.indexOf('./src/speech-controller.js')>index.indexOf('./src/main.js'))fail('speech controller must boot before main.js');
if(!sw.includes("'./src/speech-controller.js'"))fail('speech controller is not precached for offline use');

console.log(JSON.stringify({
  status:'PASS',
  speechController:'shared',
  language:'en-GB',
  voiceRefresh:'voiceschanged',
  offlineShell:true,
  routeCancellation:true,
},null,2));
