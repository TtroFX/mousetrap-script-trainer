import fs from 'node:fs';
import crypto from 'node:crypto';

const read = p => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s.endsWith('\n') ? s : `${s}\n`);
const readJson = p => JSON.parse(read(p));
const writeJson = (p, v) => write(p, JSON.stringify(v, null, 2));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const exact = (text, oldText, newText, label) => {
  const count = text.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`);
  return text.replace(oldText, newText);
};
const regex = (text, pattern, replacement, label) => {
  const matches = text.match(pattern);
  if (!matches) throw new Error(`${label}: no match`);
  return text.replace(pattern, replacement);
};
const comparable = value => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[「」『』“”‘’\"'。、，,.・:：;；!?！？()（）\[\]【】\s]/g, '');

const DICT = 'mousetrap_word_dictionary.json';
const dictionary = readJson(DICT);
let removedTemplate = 0;
let shortenedContext = 0;
let removedPattern = 0;

for (const entry of Object.values(dictionary)) {
  if (!entry || typeof entry !== 'object') continue;
  if ('pattern' in entry) { delete entry.pattern; removedPattern += 1; }
  if ('patternDesc' in entry) { delete entry.patternDesc; removedPattern += 1; }

  let note = String(entry.contextExplanation || '').trim();
  if (!note) { delete entry.contextExplanation; continue; }
  const contextMeaning = String(entry.contextMeaning || '').trim();
  const template = contextMeaning ? `劇中では文脈に応じて「${contextMeaning}」の意味で使われる。` : '';
  const genericTemplate = /^劇中では(?:文脈に応じて)?[「『].+[」』]の意味で使われる[。.]?$/;
  if ((template && comparable(note) === comparable(template)) || genericTemplate.test(note)) {
    delete entry.contextExplanation;
    removedTemplate += 1;
    continue;
  }

  const before = note;
  note = note.replace(/^(?:劇中では|この劇では|この場面では|ここでは)[、,]?\s*/, '').trim();
  if (!note || (contextMeaning && comparable(note) === comparable(contextMeaning))) {
    delete entry.contextExplanation;
    removedTemplate += 1;
    continue;
  }
  entry.contextExplanation = note;
  if (note !== before) shortenedContext += 1;
}
writeJson(DICT, dictionary);

// Keep the canonical generator from recreating redundant dictionary prose or Pattern fields.
let generator = read('scripts/expand-play-context-vocabulary.mjs');
generator = exact(generator,
`        contextMeaning,\n        contextExplanation: \`劇中では文脈に応じて「\${contextMeaning}」の意味で使われる。\`,\n        pattern: item.lemma.includes(' ') ? item.lemma : '',\n        patternDesc: item.lemma.includes(' ') ? '語をばらばらにせず、まとまりとして理解する。' : '',\n        tags: neutral.tags || []`,
`        contextMeaning,\n        tags: neutral.tags || []`,
'new dictionary fields');
generator = exact(generator,
`      if (!String(entry.contextExplanation || '').trim()) { entry.contextExplanation = \`劇中では文脈に応じて「\${entry.contextMeaning}」の意味で使われる。\`; changed = true; }\n`,
'',
'context explanation autofill');
write('scripts/expand-play-context-vocabulary.mjs', generator);

// Dictionary sheet: line-specific meaning first, optional concise Context only, no Pattern.
let main = read('app/src/main.js');
const replacement = `async function openWordSheet(line,lemma,surface){const speech=store.getSpeechById(line);if(!speech)return;if(!store.hasStudy()){setStatus('Loading dictionary…');try{await store.loadStudy();setStatus()}catch{setStatus('Dictionary data could not be loaded.','warning');return}}const entry=store.getDictionary(lemma),vocab=store.getVocabulary(line).find(v=>normalize(v.lemma)===normalize(lemma)&&(!surface||normalize(v.surface)===normalize(surface)))||store.getVocabulary(line).find(v=>normalize(v.lemma)===normalize(lemma)),scene=store.getSceneIdForSpeech(line),overlay=document.getElementById('word-overlay'),content=document.getElementById('word-content'),rows=[],seen=new Set();const cmp=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[「」『』“”‘’\\"'。、，,.・:：;；!?！？()（）\\[\\]【】\\s]/g,''),add=(k,v)=>{const text=String(v||'').trim(),key=cmp(text);if(!text||!key||seen.has(key))return;seen.add(key);rows.push(\`<dt>\${esc(k)}</dt><dd>\${esc(text)}</dd>\`)};const meaning=vocab?.meaning||entry?.contextMeaning||entry?.coreMeaning;add('Meaning',meaning);add('Core',entry?.coreMeaning);const context=String(entry?.contextExplanation||'').trim();if(context&&cmp(context)!==cmp(meaning)&&cmp(context)!==cmp(entry?.contextMeaning)&&cmp(context)!==cmp(entry?.coreMeaning))add('Context',context);add('Forms',entry?.forms);content.innerHTML=\`<header><div class="eyebrow">Dictionary</div><h2>\${esc(surface||vocab?.surface||entry?.lemma||lemma)}</h2><p>\${esc(entry?.lemma||lemma)}\${entry?.pos?\` · \${esc(entry.pos)}\`:''}\${entry?.ipa?\` · \${esc(entry.ipa)}\`:''}</p></header><section class="word-dict-card"><h3>Word dictionary</h3>\${rows.length?\`<dl>\${rows.join('')}</dl>\`:'<p class="muted">Dictionary information not found.</p>'}</section><section class="word-context-card"><h3>In this line</h3><p class="context-en">\${esc(speech.text)}</p><p>\${esc(store.getTranslation(line)||'No translation available.')}</p><button class="ghost-btn" data-word-line-open>Open Line Detail</button></section>\`;window.MTS_GESTURES?.resetSheet?.();overlay.hidden=false;content.querySelector('[data-word-line-open]').onclick=()=>{closeWordSheet();openLine(scene,line)}}\n`;
main = regex(main, /async function openWordSheet\(line,lemma,surface\)\{.*?\nfunction closeWordSheet/s, `${replacement}function closeWordSheet`, 'word sheet');
write('app/src/main.js', main);

// Cache/version bump for the changed canonical dictionary + UI.
let config = read('app/src/config.js');
config = exact(config, "index-zero-2026-08-26-r7", "index-zero-2026-08-27-r8", 'config build id');
write('app/src/config.js', config);
let sw = read('app/sw.js');
sw = exact(sw, "index-zero-2026-08-26-r7", "index-zero-2026-08-27-r8", 'sw build id');
write('app/sw.js', sw);
const pwa = readJson('app/pwa-version.json');
pwa.buildId = 'index-zero-2026-08-27-r8';
pwa.dataVersion = 'canonical-2026-08-27-dictionary-context-v2';
writeJson('app/pwa-version.json', pwa);

// Update canonical hashes.
const dictSha = sha(DICT);
const contract = readJson('data/canonical-production-contract.json');
for (const item of contract.files || []) if (item.path === DICT) item.sha256 = dictSha;
writeJson('data/canonical-production-contract.json', contract);
const manifest = readJson('data/canonical-integration-manifest.json');
manifest.studyAssets ||= {};
manifest.studyAssets.wordDictionary ||= { file: DICT };
manifest.studyAssets.wordDictionary.sha256 = dictSha;
manifest.studyAssets.wordDictionary.contextPolicy = 'Line-specific meaning comes from line vocabulary. Dictionary Context is optional supplemental information only; autogenerated restatements and Pattern fields are forbidden.';
writeJson('data/canonical-integration-manifest.json', manifest);

// Add permanent regression tests and wire them into the normal E2E suite.
const testPath = 'app/tests/dictionary_context.e2e.spec.js';
write(testPath, `const {test,expect}=require('@playwright/test');\nconst BASE='http://127.0.0.1:4173/index.html';\nasync function ready(page){await page.goto(BASE,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000});await page.evaluate(()=>MTS_INDEX_ZERO.store.loadStudy());await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy(),null,{timeout:15000})}\ntest('dictionary sheet uses line meaning and has no redundant play/pattern rows',async({page})=>{await ready(page);const sample=await page.evaluate(()=>{for(const scene of ['act1-scene1','act1-scene2','act2'])for(const speech of MTS_INDEX_ZERO.store.getScene(scene)){const v=MTS_INDEX_ZERO.store.getVocabulary(speech.id)[0];if(v)return{scene,line:speech.id,meaning:v.meaning}}return null});expect(sample).toBeTruthy();await page.goto(\`${BASE}#/line?scene=\${sample.scene}&line=\${sample.line}\`);await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy());await page.locator('.word-row').first().click();const card=page.locator('.word-dict-card');await expect(card.locator('dt',{hasText:'Meaning'})).toHaveCount(1);const meaningRow=card.locator('dt',{hasText:'Meaning'}).locator('xpath=following-sibling::dd[1]');await expect(meaningRow).toHaveText(sample.meaning);await expect(card.getByText('Pattern',{exact:true})).toHaveCount(0);await expect(card.getByText('In this play',{exact:true})).toHaveCount(0);await expect(card).not.toContainText('劇中では文脈に応じて');});\n`);
let pkg = readJson('app/package.json');
pkg.scripts['test:e2e'] = pkg.scripts['test:e2e'].replace('tests/canonical_study.e2e.spec.js', 'tests/canonical_study.e2e.spec.js tests/dictionary_context.e2e.spec.js');
writeJson('app/package.json', pkg);

// Canonical-data assertions: no obsolete production fields / generated prose.
let obsoletePatternEntries = 0;
let generatedContextEntries = 0;
for (const entry of Object.values(dictionary)) {
  if ('pattern' in entry || 'patternDesc' in entry) obsoletePatternEntries += 1;
  if (/^劇中では(?:文脈に応じて)?[「『].+[」』]の意味で使われる[。.]?$/.test(String(entry.contextExplanation || '').trim())) generatedContextEntries += 1;
}
if (obsoletePatternEntries) throw new Error(`obsolete pattern fields remain: ${obsoletePatternEntries}`);
if (generatedContextEntries) throw new Error(`generated context prose remains: ${generatedContextEntries}`);
if (main.includes("add('Pattern'")) throw new Error('Pattern UI survived');
if (main.includes("add('In this play'")) throw new Error('legacy In this play UI survived');
if (!main.includes("const meaning=vocab?.meaning||entry?.contextMeaning||entry?.coreMeaning")) throw new Error('line-specific meaning precedence missing');

console.log(JSON.stringify({
  status:'PASS',
  dictionaryEntries:Object.keys(dictionary).length,
  removedTemplate,
  shortenedContext,
  removedPattern,
  dictionarySha256:dictSha,
  buildId:'index-zero-2026-08-27-r8'
}, null, 2));
