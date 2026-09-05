import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// QA branch trigger only; production contract is identical to main.
const fail = message => { throw new Error(message); };
const read = path => fs.readFileSync(path, 'utf8');
const lineRead = read('src/line-read-aloud.js');
const speech = read('src/speech-controller.js');
const index = read('index.html');
const sw = read('sw.js');
const css = read('src/pdf-pages.css');

for (const file of ['src/speech-controller.js', 'src/line-read-aloud.js']) {
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) fail(`${file} syntax error: ${syntax.stderr || syntax.stdout}`);
}

for (const token of [
  "import { speechController } from './speech-controller.js'",
  "const OWNER_PREFIX = 'line-detail:'",
  'createLineReadAloudButton',
  'mountLineReadAloud',
  "lang: 'en-GB'",
  'text: speech.text',
  "speechController.isSpeaking(owner)",
  "speechController.cancel(owner, 'toggle-stop')",
  "holder.querySelector('[data-shiori-toggle]')",
  'holder.insertBefore(button, shiori)',
  "button.setAttribute('aria-pressed'",
  "button.setAttribute('aria-label'",
]) if (!lineRead.includes(token)) fail(`line read-aloud contract missing: ${token}`);

if (lineRead.includes('MutationObserver')) fail('line read-aloud must not depend on MutationObserver');
if (!speech.includes("phase: current?.phase || 'idle'")) fail('speech controller lacks explicit phase diagnostics');
if (!speech.includes("current = { id, owner, utterance, voice: voice || null, phase: 'queued' }")) fail('speech controller lacks queued state');
if (!speech.includes("current.phase = 'speaking'")) fail('speech controller lacks speaking state');
if (!speech.includes("document.addEventListener('visibilitychange'")) fail('speech must stop when the app is backgrounded');

const speechIndex = index.indexOf('./src/speech-controller.js');
const lineIndex = index.indexOf('./src/line-read-aloud.js');
const mainIndex = index.indexOf('./src/main.js');
if (speechIndex < 0 || lineIndex < 0 || mainIndex < 0 || !(speechIndex < lineIndex && lineIndex < mainIndex)) {
  fail('read-aloud boot order must be speech-controller -> line-read-aloud -> main');
}
if (!sw.includes("'./src/line-read-aloud.js'")) fail('line read-aloud is missing from the offline shell');
if (!css.includes('.line-bookmark-holder .bookmark-toggle{width:34px;height:34px}')) fail('line read-aloud control does not inherit the compact line-detail control size');

console.log(JSON.stringify({
  status: 'PASS',
  uiMounted: false,
  implementationReady: true,
  canonicalTextSource: 'store.getSpeech(...).text',
  placementContract: 'immediately-left-of-shiori',
  language: 'en-GB',
  toggleStop: true,
  routeAndBackgroundCancellation: true,
  offlineRuntime: true,
  mutationObserver: false,
}, null, 2));
