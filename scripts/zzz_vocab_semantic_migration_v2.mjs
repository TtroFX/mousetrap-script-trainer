import fs from 'node:fs';
import crypto from 'node:crypto';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const fail=m=>{throw new Error(m)};
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const patch=(p,from,to)=>{let s=fs.readFileSync(p,'utf8');if(!s.includes(from))fail(`patch target missing: ${p}`);fs.writeFileSync(p,s.replace(from,to));};

const dict=read('mousetrap_word_dictionary.json');
const vocab=read('mousetrap_line_vocabulary.json');
const dictByLemma=new Map(Object.entries(dict).map(([k,v])=>[k.trim().toLowerCase(),v]));

for(const [key,entry] of Object.entries(dict)){
  const meaning=String(entry?.meaning||'').trim();
  if(!meaning)fail(`dictionary meaning missing: ${key}`);
  entry.coreMeaning=meaning;
  delete entry.contextMeaning;
  delete entry.contextExplanation;
}

const keepInThisPlay=text=>/(本気で|冗談|皮肉|からか|自嘲|わざと|比喩|大げさ|誇張|婉曲|遠回し|暗に|親しみ|見下し|ぞんざい|単に.+ではない|意味ではなく|文字どおり.+ではなく|本当に.+ではなく|認めた発言ではない|強く予想する言い方|軽く文句|軽い文句|語用|含み)/.test(String(text||'').trim());
let items=0,withContext=0,removed=0;
for(const [lineId,rows] of Object.entries(vocab)){
  if(!Array.isArray(rows))fail(`vocabulary ${lineId}: array required`);
  for(const entry of rows){
    items++;
    const d=dictByLemma.get(String(entry.lemma||'').trim().toLowerCase());
    if(!d)fail(`missing dictionary lemma ${entry.lemma}`);
    entry.meaning=d.meaning;
    if('inThisPlay' in entry){
      const text=String(entry.inThisPlay||'').trim();
      if(text&&keepInThisPlay(text)){entry.inThisPlay=text;withContext++;}
      else{delete entry.inThisPlay;removed++;}
    }
  }
}
write('mousetrap_word_dictionary.json',dict);
write('mousetrap_line_vocabulary.json',vocab);

patch('app/src/study/dictionary-sheet.js',
"    const meaning = String(vocab?.meaning || entry?.contextMeaning || entry?.coreMeaning || '').trim();\n    const core = String(entry?.coreMeaning || '').trim();\n    const contextNote = String(entry?.contextExplanation || '').trim();\n    const forms = String(entry?.forms || '').trim();",
"    const meaning = String(entry?.meaning || vocab?.meaning || entry?.coreMeaning || '').trim();\n    const inThisPlay = String(vocab?.inThisPlay || '').trim();\n    const forms = String(entry?.forms || '').trim();");
patch('app/src/study/dictionary-sheet.js',
"    add('Meaning', meaning);\n    if (core && !sameText(core, meaning)) add('Core', core);\n    if (contextNote && !sameText(contextNote, meaning) && !sameText(contextNote, core)) add('Context', contextNote);\n    add('Forms', forms);",
"    add('Meaning', meaning);\n    add('In this play', inThisPlay);\n    add('Forms', forms);");
patch('app/src/app.css','.word-dict-card dd{margin:0}', '.word-dict-card dd{margin:0;white-space:pre-line}');

patch('app/src/data-store.js',
"      if (typeof entry.playMeaning !== 'boolean') throw new Error(`vocabulary.${lineId}: playMeaning boolean required`);",
"      if (typeof entry.playMeaning !== 'boolean') throw new Error(`vocabulary.${lineId}: playMeaning boolean required`);\n      if (Object.prototype.hasOwnProperty.call(entry, 'inThisPlay')) {\n        const inThisPlay = String(entry.inThisPlay || '').trim();\n        if (typeof entry.inThisPlay !== 'string' || !inThisPlay || inThisPlay.length > 360 || inThisPlay === meaning) throw new Error(`vocabulary.${lineId}: invalid inThisPlay`);\n      }");
patch('app/src/data-store.js',
"function validateDictionary(value) {",
"const normalizeSemantic = value => String(value || '').normalize('NFKC').replace(/\\s+/g, ' ').trim();\nfunction validateVocabularyDictionaryConsistency(vocabulary, dictionary) {\n  const byLemma = new Map(Object.entries(dictionary).map(([key, entry]) => [key.trim().toLowerCase(), entry]));\n  for (const [lineId, rows] of Object.entries(vocabulary)) for (const entry of rows) {\n    const dictionaryEntry = byLemma.get(String(entry.lemma || '').trim().toLowerCase());\n    if (!dictionaryEntry) throw new Error(`vocabulary.${lineId}: missing dictionary lemma ${entry.lemma}`);\n    if (normalizeSemantic(entry.meaning) !== normalizeSemantic(dictionaryEntry.meaning)) throw new Error(`vocabulary.${lineId}: meaning/dictionary mismatch ${entry.lemma}`);\n  }\n}\nfunction validateDictionary(value) {");
patch('app/src/data-store.js',
"    if (!String(key).trim() || !entry || typeof entry !== 'object' || !String(entry.coreMeaning || '').trim()) throw new Error('dictionary: invalid entry ' + key);\n    if (Object.prototype.hasOwnProperty.call(entry, 'pattern') || Object.prototype.hasOwnProperty.call(entry, 'patternDesc')) throw new Error('dictionary: Pattern fields are forbidden (' + key + ')');\n    const context = String(entry.contextExplanation || '').trim();\n    if (/^(?:劇中では|この劇では)/.test(context) || /前後関係からこの意味を取る。?$/.test(context)) throw new Error('dictionary: generic context prose is forbidden (' + key + ')');",
"    if (!String(key).trim() || !entry || typeof entry !== 'object' || !String(entry.meaning || '').trim() || !String(entry.coreMeaning || '').trim()) throw new Error('dictionary: invalid entry ' + key);\n    if (normalizeSemantic(entry.meaning) !== normalizeSemantic(entry.coreMeaning)) throw new Error('dictionary: coreMeaning must mirror neutral meaning (' + key + ')');\n    if (Object.prototype.hasOwnProperty.call(entry, 'contextMeaning') || Object.prototype.hasOwnProperty.call(entry, 'contextExplanation')) throw new Error('dictionary: play-context fields are forbidden (' + key + ')');\n    if (Object.prototype.hasOwnProperty.call(entry, 'pattern') || Object.prototype.hasOwnProperty.call(entry, 'patternDesc')) throw new Error('dictionary: Pattern fields are forbidden (' + key + ')');");
patch('app/src/data-store.js',
"        this.studyState.status = 'ready'; this.studyState.error = null;",
"        validateVocabularyDictionaryConsistency(this.vocabulary, this.dictionary);\n        this.studyState.status = 'ready'; this.studyState.error = null;");

patch('app/scripts/assemble-production.mjs',
"for(const [lemma,entry] of Object.entries(dictionary)){if(!entry||typeof entry!=='object'||!String(entry.coreMeaning||'').trim())fail(`invalid dictionary ${lemma}`);if(Object.prototype.hasOwnProperty.call(entry,'pattern')||Object.prototype.hasOwnProperty.call(entry,'patternDesc'))fail(`dictionary Pattern fields forbidden: ${lemma}`);const context=String(entry.contextExplanation||'').trim();if(/^(?:劇中では|この劇では)/.test(context)||/前後関係からこの意味を取る。?$/.test(context))fail(`generic dictionary context forbidden: ${lemma}`);}\nfor(const rows of Object.values(vocabulary))for(const entry of rows)if(!dictionaryKeys.has(String(entry.lemma||'').trim().toLowerCase()))fail(`missing dictionary lemma ${entry.lemma}`);",
"const dictionaryByKey=new Map(Object.entries(dictionary).map(([key,entry])=>[key.trim().toLowerCase(),entry]));\nfor(const [lemma,entry] of Object.entries(dictionary)){if(!entry||typeof entry!=='object'||!String(entry.meaning||'').trim()||!String(entry.coreMeaning||'').trim())fail(`invalid dictionary ${lemma}`);if(String(entry.meaning).trim()!==String(entry.coreMeaning).trim())fail(`dictionary coreMeaning mismatch: ${lemma}`);if(Object.prototype.hasOwnProperty.call(entry,'contextMeaning')||Object.prototype.hasOwnProperty.call(entry,'contextExplanation'))fail(`dictionary play-context field forbidden: ${lemma}`);if(Object.prototype.hasOwnProperty.call(entry,'pattern')||Object.prototype.hasOwnProperty.call(entry,'patternDesc'))fail(`dictionary Pattern fields forbidden: ${lemma}`);}\nfor(const [lineId,rows] of Object.entries(vocabulary))for(const entry of rows){const key=String(entry.lemma||'').trim().toLowerCase();const d=dictionaryByKey.get(key);if(!d)fail(`missing dictionary lemma ${entry.lemma}`);if(String(entry.meaning||'').trim()!==String(d.meaning||'').trim())fail(`vocabulary/dictionary meaning mismatch ${lineId}: ${entry.lemma}`);if(Object.prototype.hasOwnProperty.call(entry,'inThisPlay')){const t=String(entry.inThisPlay||'').trim();if(typeof entry.inThisPlay!=='string'||!t||t.length>360||t===String(entry.meaning||'').trim())fail(`invalid inThisPlay ${lineId}: ${entry.lemma}`);}}");

const validator=[
"import fs from 'node:fs';",
"const fail=m=>{throw new Error(m)};",
"const dict=JSON.parse(fs.readFileSync('mousetrap_word_dictionary.json','utf8'));",
"const vocab=JSON.parse(fs.readFileSync('mousetrap_line_vocabulary.json','utf8'));",
"const map=new Map(Object.entries(dict).map(([k,v])=>[k.trim().toLowerCase(),v]));",
"let items=0,ctx=0;",
"for(const [k,d] of Object.entries(dict)){if(!String(d.meaning||'').trim())fail('missing meaning '+k);if(String(d.meaning).trim()!==String(d.coreMeaning||'').trim())fail('core mismatch '+k);if('contextMeaning' in d||'contextExplanation' in d)fail('play context leaked into dictionary '+k);}",
"for(const [line,rows] of Object.entries(vocab)){if(!Array.isArray(rows))fail('rows '+line);for(const e of rows){items++;const d=map.get(String(e.lemma||'').trim().toLowerCase());if(!d)fail('missing lemma '+e.lemma);if(String(e.meaning||'').trim()!==String(d.meaning||'').trim())fail('meaning mismatch '+line+' '+e.lemma);if('inThisPlay' in e){const t=String(e.inThisPlay||'').trim();if(typeof e.inThisPlay!=='string'||!t||t.length>360||t===String(e.meaning||'').trim())fail('invalid inThisPlay '+line+' '+e.lemma);ctx++;}}}",
"console.log(JSON.stringify({status:'PASS',dictionary:Object.keys(dict).length,vocabularyItems:items,inThisPlay:ctx},null,2));",
''
].join('\n');
fs.writeFileSync('scripts/validate-vocabulary-semantics.mjs',validator);

patch('.github/workflows/app-qa.yml',
"      - name: Validate canonical source data\n        run: |\n          node scripts/validate-interpretation-scene.mjs act1-scene1",
"      - name: Validate canonical source data\n        run: |\n          node scripts/validate-vocabulary-semantics.mjs\n          node scripts/validate-interpretation-scene.mjs act1-scene1");
patch('.github/workflows/pages.yml',
"      - name: Validate committed chunking v1 canonical data\n        run: |\n          python3 -m py_compile app/scripts/validate-chunking-v1.py",
"      - name: Validate committed canonical data\n        run: |\n          node scripts/validate-vocabulary-semantics.mjs\n          python3 -m py_compile app/scripts/validate-chunking-v1.py");

const e2ePath='app/tests/canonical_study.e2e.spec.js';
let e2e=fs.readFileSync(e2ePath,'utf8');
e2e += "\n\ntest('dictionary sheet separates Meaning and optional In this play',async({page})=>{await ready(page);const sample=await page.evaluate(()=>{for(const scene of ['act1-scene1','act1-scene2','act2'])for(const speech of MTS_INDEX_ZERO.store.getScene(scene)){const v=MTS_INDEX_ZERO.store.getVocabulary(speech.id).find(x=>x.inThisPlay);if(v)return{scene,line:speech.id,surface:v.surface,meaning:v.meaning,inThisPlay:v.inThisPlay}}return null});expect(sample).toBeTruthy();await page.goto(BASE+'#/line?scene='+encodeURIComponent(sample.scene)+'&line='+encodeURIComponent(sample.line));await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy());await page.locator('[data-word-line]').filter({hasText:sample.surface}).first().click();const card=page.locator('.word-dict-card');await expect(card).toContainText('Meaning');await expect(card).toContainText(sample.meaning);await expect(card).toContainText('In this play');await expect(card).toContainText(sample.inThisPlay);await expect(card).not.toContainText('Core');await expect(card).not.toContainText('Context');});\n";
e2e += "\ntest('dictionary Meaning preserves line breaks in rendered card',async({page})=>{await ready(page);const sample=await page.evaluate(()=>{for(const scene of ['act1-scene1','act1-scene2','act2'])for(const speech of MTS_INDEX_ZERO.store.getScene(scene)){const v=MTS_INDEX_ZERO.store.getVocabulary(speech.id).find(x=>String(x.meaning||'').includes('\\n'));if(v)return{scene,line:speech.id,surface:v.surface}}return null});expect(sample).toBeTruthy();await page.goto(BASE+'#/line?scene='+encodeURIComponent(sample.scene)+'&line='+encodeURIComponent(sample.line));await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy());await page.locator('[data-word-line]').filter({hasText:sample.surface}).first().click();expect(await page.locator('.word-dict-card dd').first().evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('pre-line');});\n";
fs.writeFileSync(e2ePath,e2e);

const contract=read('data/canonical-production-contract.json');
for(const item of contract.files)if(item.path==='mousetrap_line_vocabulary.json'||item.path==='mousetrap_word_dictionary.json')item.sha256=sha(item.path);
write('data/canonical-production-contract.json',contract);
const manifest=read('data/canonical-integration-manifest.json');
const refresh=o=>{if(!o||typeof o!=='object')return;for(const [k,v] of Object.entries(o)){if(typeof v==='string'&&/^[0-9a-f]{64}$/i.test(v)){if(k.toLowerCase().includes('vocabulary'))o[k]=sha('mousetrap_line_vocabulary.json');if(k.toLowerCase().includes('dictionary'))o[k]=sha('mousetrap_word_dictionary.json');}else refresh(v)}};
refresh(manifest);write('data/canonical-integration-manifest.json',manifest);
console.log(JSON.stringify({status:'MIGRATED',dictionary:Object.keys(dict).length,vocabularyItems:items,inThisPlay:withContext,removedInThisPlay:removed},null,2));
