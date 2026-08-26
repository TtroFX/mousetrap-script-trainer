#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,re,subprocess
from pathlib import Path

ROOT=Path.cwd()
BRANCH='feature/canonical-vocab-structure-ui-v3'
BASELINE='2a1798a6bc69f6e1c485f0d280d6307c657f9a6d'

def read(path): return (ROOT/path).read_text(encoding='utf-8')
def write(path,text):
    p=ROOT/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text if text.endswith('\n') else text+'\n',encoding='utf-8')
def read_json(path): return json.loads(read(path))
def write_json(path,obj): write(path,json.dumps(obj,ensure_ascii=False,indent=2))
def sha(path): return hashlib.sha256((ROOT/path).read_bytes()).hexdigest()
def exact(text,old,new,label):
    n=text.count(old)
    if n!=1: raise RuntimeError(f'{label}: expected 1 match, got {n}')
    return text.replace(old,new,1)
def regex(text,pattern,repl,label):
    new,n=re.subn(pattern,repl,text,count=1,flags=re.S)
    if n!=1: raise RuntimeError(f'{label}: expected 1 match, got {n}')
    return new

def norm(s):
    s=str(s or '').lower()
    s=re.sub(r"[‘’“”\"']",'',s)
    s=re.sub(r'[‐‑‒–—―-]',' ',s)
    s=re.sub(r'[^a-z0-9]+',' ',s)
    return re.sub(r'\s+',' ',s).strip()
def key(speech_id,item): return (speech_id,norm(item.get('surface')),str(item.get('lemma') or '').strip().lower())

# 1) Canonical vocabulary presentation contract.
current=read_json('mousetrap_line_vocabulary.json')
baseline=json.loads(subprocess.check_output(['git','show',f'{BASELINE}:mousetrap_line_vocabulary.json'],text=True))
baseline_keys={key(sid,item) for sid,rows in baseline.items() for item in (rows or [])}
contextual=set()
for i in range(1,7):
    p=ROOT/f'data/vocabulary-rebuild/block-{i}-line-vocabulary.json'
    if not p.exists(): continue
    doc=json.loads(p.read_text(encoding='utf-8'))
    for sid,rows in (doc.get('lines') or {}).items():
        for item in rows or []:
            if str(item.get('contextMeaning') or '').strip(): contextual.add(key(sid,item))

visible=hidden=total=0
for sid,rows in current.items():
    if not isinstance(rows,list): raise RuntimeError(f'vocab {sid}: array required')
    for item in rows:
        k=key(sid,item)
        item['playMeaning']=bool(k in baseline_keys or k in contextual)
        total+=1
        if item['playMeaning']: visible+=1
        else: hidden+=1
if total!=1741: raise RuntimeError(f'vocabulary total {total}/1741')
if hidden!=353: raise RuntimeError(f'neutral-only count {hidden}/353')
if visible!=1388: raise RuntimeError(f'play-meaning count {visible}/1388')
write_json('mousetrap_line_vocabulary.json',current)

report=read_json('data/vocabulary-context-expansion-report.json')
report['presentation']={
    'policy':'Line Vocabulary is shown only for occurrence entries with a curated/reviewed play meaning. Neutral B1+ promotion remains dictionary/study data but is not presented as a line vocabulary item.',
    'canonicalItems':total,'playMeaningItems':visible,'neutralOnlyItems':hidden,
    'field':'playMeaning'
}
write_json('data/vocabulary-context-expansion-report.json',report)

contract=read_json('data/canonical-production-contract.json')
for item in contract.get('files',[]):
    if item.get('path')=='mousetrap_line_vocabulary.json': item['sha256']=sha('mousetrap_line_vocabulary.json')
write_json('data/canonical-production-contract.json',contract)
manifest=read_json('data/canonical-integration-manifest.json')
lv=manifest.setdefault('studyAssets',{}).setdefault('lineVocabulary',{})
lv.update({'sha256':sha('mousetrap_line_vocabulary.json'),'coverageSpeechIds':1164,'items':total,'playMeaningItems':visible,'neutralOnlyItems':hidden,'presentationField':'playMeaning'})
write_json('data/canonical-integration-manifest.json',manifest)

# 2) DataStore: validate canonical vocab schema; expose only play-meaning occurrences to views.
data=read('app/src/data-store.js')
validator="""function validateVocabulary(value) {
  validateSpeechMap(value, 'vocabulary');
  for (const [lineId, rows] of Object.entries(value)) {
    if (!Array.isArray(rows)) throw new Error(`vocabulary.${lineId}: array required`);
    const seen = new Set();
    for (const entry of rows) {
      const surface = String(entry?.surface || '').trim();
      const lemma = String(entry?.lemma || '').trim();
      const meaning = String(entry?.meaning || '').trim();
      if (!surface || !lemma || !meaning) throw new Error(`vocabulary.${lineId}: surface/lemma/meaning required`);
      if (typeof entry.playMeaning !== 'boolean') throw new Error(`vocabulary.${lineId}: playMeaning boolean required`);
      const key = `${surface.toLowerCase()}\\u0000${lemma.toLowerCase()}`;
      if (seen.has(key)) throw new Error(`vocabulary.${lineId}: duplicate ${surface}/${lemma}`);
      seen.add(key);
    }
  }
  return value;
}

"""
data=exact(data,'function validateDictionary(value) {',validator+'function validateDictionary(value) {','vocab validator insertion')
data=exact(data,"['vocabulary', DATA_PATHS.vocabulary, value => validateSpeechMap(value, 'vocabulary')]","['vocabulary', DATA_PATHS.vocabulary, validateVocabulary]",'vocab validator hookup')
data=exact(data,"  getVocabulary(lineId) { return Array.isArray(this.vocabulary?.[lineId]) ? this.vocabulary[lineId] : []; }","  getVocabulary(lineId) { return Array.isArray(this.vocabulary?.[lineId]) ? this.vocabulary[lineId].filter(entry => entry?.playMeaning === true) : []; }\n  getVocabularyAll(lineId) { return Array.isArray(this.vocabulary?.[lineId]) ? this.vocabulary[lineId] : []; }",'vocab getter')
write('app/src/data-store.js',data)

# 3) Structure view model + renderer: marker/clause model only, no legacy role/type projection.
main=read('app/src/main.js')
structure_impl=r'''const STRUCTURE_MARKER_LABELS=Object.freeze({BC:'Base clause',AC:'Adverbial clause',NC:'Noun clause',RC:'Relative clause',S:'Subject',V:'Verb',O:'Object',C:'Complement',HV:'Auxiliary',ACC:'Subordinator',Conj:'Coordinator',N:'Noun phrase',Adj:'Adjectival',Adv:'Adverbial',Prep:'Prepositional phrase',Voc:'Vocative',Int:'Interjection',Resp:'Response',Frag:'Fragment',Other:'Other'});
function markerBase(marker){return String(marker||'').replace(/\d+[a-z]?$/,'')}
function markerLabel(marker){return STRUCTURE_MARKER_LABELS[markerBase(marker)]||markerBase(marker)||'Chunk'}
function clauseDepth(clause,byId){let depth=0,cur=clause,seen=new Set();while(cur?.parentClauseId&&byId.has(cur.parentClauseId)&&!seen.has(cur.parentClauseId)){seen.add(cur.parentClauseId);depth++;cur=byId.get(cur.parentClauseId)}return depth}
function structureSentenceModel(sentence){const clauses=Array.isArray(sentence?.clauses)?sentence.clauses:[],chunks=Array.isArray(sentence?.chunks)?sentence.chunks:[],byId=new Map(clauses.map(c=>[c.id,c]));const indexed=chunks.map((chunk,index)=>({chunk,index}));return{groups:clauses.map(clause=>({clause,depth:clauseDepth(clause,byId),chunks:indexed.filter(x=>x.chunk.clauseId===clause.id)})),loose:indexed.filter(x=>!x.chunk.clauseId||!byId.has(x.chunk.clauseId))}}
function structureChunkHtml(sentenceText,item,si){const c=item.chunk,base=markerBase(c.marker);return `<button class="structure-chunk marker-${esc(base.toLowerCase())}" data-structure-info="${si}:${item.index}" data-marker="${esc(c.marker)}"><small>${esc(c.marker)}</small><span>${esc(sentenceText.slice(c.start,c.end))}</span><i>${esc(markerLabel(c.marker))}</i></button>`}
function structureHtml(speech,line){if(!line?.sentences?.length)return'<p class="muted">Structure is unavailable.</p>';return line.sentences.map((s,si)=>{const text=speech.text.slice(s.start,s.end),model=structureSentenceModel(s),clauses=model.groups.map(g=>`<section class="structure-clause" style="--clause-depth:${g.depth}" data-clause-marker="${esc(g.clause.marker)}"><header><b>${esc(g.clause.marker)}</b><span>${esc(markerLabel(g.clause.marker))}${g.clause.functionInParent?` · ${esc(g.clause.functionInParent)} in parent`:''}</span></header><p>${esc(text.slice(g.clause.start,g.clause.end))}</p><div class="structure-row">${g.chunks.map(x=>structureChunkHtml(text,x,si)).join('')}</div></section>`).join(''),loose=model.loose.length?`<section class="structure-clause structure-fragment"><header><b>${s.kind==='fragment'?'Fragment':'Other'}</b><span>${s.kind==='fragment'?'Non-clausal response / phrase':'Chunks outside a clause'}</span></header><div class="structure-row">${model.loose.map(x=>structureChunkHtml(text,x,si)).join('')}</div></section>`:'';return`<div class="structure-sentence"><b>Sentence ${si+1}</b><p>${esc(text)}</p>${clauses}${loose}<div class="structure-info" data-structure-box="${si}" hidden></div></div>`}).join('')+`<div class="structure-key"><span>Clauses: BC / AC / NC / RC</span><span>Core: S / V / O / C</span><span>Also: HV / ACC / Conj / phrase & dialogue markers</span></div>`}
'''
main=regex(main,r"function structureHtml\(speech,line\)\{.*?\nfunction openLine",structure_impl+'function openLine','structure renderer replacement')

line_view=r'''function lineView(q){const scene=q.get('scene'),line=q.get('line'),token=routeGeneration;if(!renderCoreState('Line Detail','script',token))return;const speech=store.getSpeech(scene,line);if(!speech){go('#/script');return}state.setScene(scene);state.markReaderSeen(scene,line);const study=store.hasStudy(),structReady=store.hasStructure(),translation=study?store.getTranslation(line):'',interpretation=study?store.getInterpretation(line):[],grammar=study?store.getGrammar(line):[],vocab=study?store.getVocabulary(line):[],structure=structReady?store.getStructure(line):null,rows=store.getScene(scene),i=rows.findIndex(x=>x.id===line),prev=rows[i-1],next=rows[i+1];const grammarHtml=study&&grammar.length?`<h3>Grammar / Usage</h3>${grammar.map(g=>`<div class="grammar-item"><b>${esc(g.pattern)}</b><p>${esc(g.description)}</p></div>`).join('')}`:'',vocabHtml=study&&vocab.length?`<h3>Vocabulary</h3>${vocab.map((v,n)=>`<button class="word-row" data-detail-word="${n}"><b>${esc(v.surface)} · ${esc(v.meaning)}</b><span>${esc(v.lemma)}</span></button>`).join('')}`:'',studyCard=grammarHtml||vocabHtml?`<div class="card study-notes">${grammarHtml}${vocabHtml}</div>`:'';chrome(`<section class="line-page"><div class="card"><div class="speaker-title">${esc(speech.speaker)}</div><p class="line-detail-text">${annotatedText(speech.text,line)}</p><span class="chip">${esc(sceneMeta(scene).label)}</span></div><div class="card" data-translation-card><div class="eyebrow">Translation</div>${study?`<p class="translation">${esc(translation||'No translation available.')}</p>${interpretationHtml(interpretation)}`:store.studyState.status==='error'?'<p class="error-text">Translation and study notes could not be loaded.</p>':'<p class="micro-status">Loading translation and study notes…</p>'}</div><div class="card" data-structure-card>${structReady?`<details class="structure-details"><summary class="structure-summary"><span>Structure</span><small>Clause hierarchy · S / V / O / C · connectors</small></summary>${structureHtml(speech,structure)}</details>`:store.structureState.status==='error'?'<p class="error-text">Structure could not be loaded.</p>':'<p class="micro-status">Loading Structure…</p>'}</div>${studyCard}<div class="card"><div class="toolbar"><button class="primary-btn" data-line-cue>Cue Practice</button><button class="ghost-btn" data-line-rehearsal>Rehearsal</button></div></div><div class="floating-nav"><button data-prev ${prev?'':'disabled'}>‹</button><button data-close-line>×</button><button data-next ${next?'':'disabled'}>›</button></div></section>`,'script');bindWordButtons();app.querySelectorAll('[data-detail-word]').forEach(b=>b.onclick=()=>{const v=vocab[Number(b.dataset.detailWord)];if(v)openWordSheet(line,v.lemma,v.surface)});app.querySelector('[data-line-cue]').onclick=()=>go(`#/cue?scene=${encodeURIComponent(scene)}&line=${encodeURIComponent(line)}`);app.querySelector('[data-line-rehearsal]').onclick=()=>go(`#/rehearsal?scene=${encodeURIComponent(scene)}&line=${encodeURIComponent(line)}`);app.querySelector('[data-prev]').onclick=()=>prev&&openLine(scene,prev.id);app.querySelector('[data-next]').onclick=()=>next&&openLine(scene,next.id);app.querySelector('[data-close-line]').onclick=()=>go(`#/script?line=${encodeURIComponent(line)}`);app.querySelectorAll('[data-structure-info]').forEach(b=>b.onclick=()=>{const[si,ci]=b.dataset.structureInfo.split(':').map(Number),s=structure?.sentences?.[si],c=s?.chunks?.[ci],box=app.querySelector(`[data-structure-box="${si}"]`);if(s&&c&&box){const sentenceText=speech.text.slice(s.start,s.end),clause=(s.clauses||[]).find(x=>x.id===c.clauseId),parts=[c.marker,markerLabel(c.marker),c.layer,clause?.marker].filter(Boolean);box.textContent=`${parts.join(' · ')} — ${sentenceText.slice(c.start,c.end)}`;box.hidden=false}});if(!study&&store.studyState.status==='idle')store.loadStudy().then(()=>token===routeGeneration&&renderRoute()).catch(()=>token===routeGeneration&&renderRoute());if(!structReady&&store.structureState.status==='idle')store.loadStructure().then(()=>token===routeGeneration&&renderRoute()).catch(()=>token===routeGeneration&&renderRoute());if(store.studyState.status==='error'){app.querySelector('[data-translation-card]')?.insertAdjacentHTML('beforeend','<button class="ghost-btn" data-retry-study>Retry study data</button>');app.querySelector('[data-retry-study]')?.addEventListener('click',()=>store.loadStudy({force:true}).then(renderRoute).catch(renderRoute))}if(store.structureState.status==='error'){app.querySelector('[data-structure-card]')?.insertAdjacentHTML('beforeend','<button class="ghost-btn" data-retry-structure>Retry Structure</button>');app.querySelector('[data-retry-structure]')?.addEventListener('click',()=>store.loadStructure({force:true}).then(renderRoute).catch(renderRoute))}}
'''
main=regex(main,r"function lineView\(q\)\{.*?\nasync function openWordSheet",line_view+'async function openWordSheet','line view replacement')
if 'arrangeLineStudySections' in main: raise RuntimeError('legacy arrangeLineStudySections survived')
if 'c.role' in main or 'c.type' in main: raise RuntimeError('legacy structure role/type survived')
write('app/src/main.js',main)

# 4) CSS: replace old role/type structure styling with marker/clause hierarchy styling.
css=read('app/src/app.css')
new_css='''.structure-sentence{border-top:1px solid #eee6dd;padding:13px 0}.structure-sentence:first-child{border-top:0}.structure-sentence>p{font:650 16px/1.6 Georgia,"Times New Roman",serif}.structure-clause{margin:10px 0 10px calc(var(--clause-depth,0)*14px);border-left:2px solid #d8cec3;padding:8px 0 8px 10px}.structure-clause>header{display:flex;align-items:baseline;gap:8px}.structure-clause>header b{font-size:12px;color:var(--accent)}.structure-clause>header span{font-size:10px;color:var(--muted)}.structure-clause>p{margin:5px 0 8px;font:620 14px/1.55 Georgia,"Times New Roman",serif}.structure-fragment{border-left-style:dashed}.structure-row{display:flex;flex-wrap:wrap;gap:6px}.structure-chunk{display:grid;grid-template-rows:auto auto auto;border:1px solid #e5ddd4;border-radius:9px;padding:5px 7px;text-align:left;background:#f8f5f1;color:var(--ink);max-width:100%}.structure-chunk small{font-weight:950;color:var(--accent)}.structure-chunk span{font:650 14px/1.4 Georgia,"Times New Roman",serif;border-bottom:2px solid currentColor}.structure-chunk i{font-size:9px;color:var(--muted);font-style:normal;margin-top:3px}.marker-s,.marker-v,.marker-o,.marker-c{background:#faf7f3}.marker-hv,.marker-acc,.marker-conj{background:#f4f0ea}.marker-resp,.marker-frag,.marker-voc,.marker-int{background:#f7f3ee}.structure-info{margin-top:8px;border-radius:10px;background:#f4efe9;padding:9px;font-size:12px;color:var(--muted)}.structure-key{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.structure-key span{font-size:10px;background:#f4efe9;border-radius:999px;padding:4px 7px;color:var(--muted)}.structure-summary{display:flex;justify-content:space-between;gap:10px;align-items:baseline}.structure-summary small{font-size:10px;color:var(--muted);font-weight:650}'''
css=regex(css,r"\.structure-sentence\{.*?\.structure-legend\{.*?\}",new_css,'structure css replacement')
write('app/src/app.css',css)

# 5) Production validation records presentation semantics.
assembly=read('app/scripts/assemble-production.mjs')
needle="""const vocabItems=Object.values(vocabulary).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0);
const grammarItems=Object.values(grammar).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0);
if(vocabItems<1186||grammarItems!==692)fail('annotation item counts invalid');
const dictionaryKeys=new Set(Object.keys(dictionary).map(x=>x.trim().toLowerCase()));
"""
replacement="""const vocabItems=Object.values(vocabulary).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0);
const grammarItems=Object.values(grammar).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0);
if(vocabItems<1186||grammarItems!==692)fail('annotation item counts invalid');
let vocabularyDisplayed=0,vocabularyNeutralOnly=0;
for(const [lineId,rows] of Object.entries(vocabulary)){if(!Array.isArray(rows))fail(`vocabulary ${lineId}: array required`);const seen=new Set();for(const entry of rows){const surface=String(entry?.surface||'').trim(),lemma=String(entry?.lemma||'').trim(),meaning=String(entry?.meaning||'').trim();if(!surface||!lemma||!meaning||typeof entry.playMeaning!=='boolean')fail(`vocabulary ${lineId}: invalid entry`);const key=`${surface.toLowerCase()}\\u0000${lemma.toLowerCase()}`;if(seen.has(key))fail(`vocabulary ${lineId}: duplicate ${surface}/${lemma}`);seen.add(key);entry.playMeaning?vocabularyDisplayed++:vocabularyNeutralOnly++;}}
if(vocabularyDisplayed!==1388||vocabularyNeutralOnly!==353)fail(`vocabulary presentation counts invalid (${vocabularyDisplayed}/${vocabularyNeutralOnly})`);
const dictionaryKeys=new Set(Object.keys(dictionary).map(x=>x.trim().toLowerCase()));
"""
assembly=exact(assembly,needle,replacement,'production vocab validation')
assembly=assembly.replace('vocabulary:vocabItems,grammar:grammarItems','vocabulary:vocabItems,vocabularyDisplayed,vocabularyNeutralOnly,grammar:grammarItems')
write('app/scripts/assemble-production.mjs',assembly)

# 6) Build id/cache revision.
config=read('app/src/config.js');config=exact(config,"export const BUILD_ID = 'index-zero-2026-08-26-r6';","export const BUILD_ID = 'index-zero-2026-08-26-r7';",'config build');write('app/src/config.js',config)
sw=read('app/sw.js');sw=exact(sw,"const BUILD_ID='index-zero-2026-08-26-r6';","const BUILD_ID='index-zero-2026-08-26-r7';",'sw build');write('app/sw.js',sw)
version=read_json('app/pwa-version.json');version['buildId']='index-zero-2026-08-26-r7';version['dataVersion']='canonical-2026-08-26-context-vocab-chunk-ui-v1';write_json('app/pwa-version.json',version)

# 7) Permanent tests assert the new canonical UI, not compatibility behavior.
static=read('app/tests/index_zero_static.mjs')
static=exact(static,"if(!main.includes('arrangeLineStudySections')||!main.includes('structure-details'))fail('Line Detail study ordering/collapse missing');","if(main.includes('arrangeLineStudySections')||main.includes('c.role')||main.includes('c.type')||main.includes('S / V / O / C / M'))fail('legacy Structure projection remains');if(!main.includes('structureSentenceModel')||!main.includes('data-clause-marker')||!main.includes('data-marker'))fail('chunking-v1 Structure view model missing');if(!data.includes('validateVocabulary')||!data.includes('playMeaning === true'))fail('Vocabulary presentation contract missing');",'static structure contract')
static=exact(static,"if(!main.includes(\"No additional grammar notes.\")||!main.includes(\"No vocabulary entries.\"))fail('r5 empty study suppression contract missing');","if(main.includes(\"No additional grammar notes.\")||main.includes(\"No vocabulary entries.\"))fail('empty study placeholder copy must not exist');",'static empty contract')
write('app/tests/index_zero_static.mjs',static)

e2e=r'''const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';
async function ready(page){await page.goto(BASE,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000});await page.evaluate(()=>Promise.all([MTS_INDEX_ZERO.store.loadStudy(),MTS_INDEX_ZERO.store.loadStructure()]));await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy()&&MTS_INDEX_ZERO.store.hasStructure(),null,{timeout:15000})}

test('neutral-only vocabulary never enters line presentation while play meanings do',async({page})=>{await ready(page);const sample=await page.evaluate(()=>{for(const scene of ['act1-scene1','act1-scene2','act2'])for(const speech of MTS_INDEX_ZERO.store.getScene(scene)){const all=MTS_INDEX_ZERO.store.getVocabularyAll(speech.id),shown=MTS_INDEX_ZERO.store.getVocabulary(speech.id);const hidden=all.find(x=>x.playMeaning===false);if(hidden)return{scene,line:speech.id,hiddenSurface:hidden.surface,shown:shown.length}}return null});expect(sample).toBeTruthy();await page.goto(`${BASE}#/line?scene=${sample.scene}&line=${sample.line}`);await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy());const rows=page.locator('.word-row');await expect(rows).toHaveCount(sample.shown);if(sample.shown===0)await expect(page.getByRole('heading',{name:'Vocabulary'})).toHaveCount(0);const highlighted=await page.locator('.vocab-inline').allTextContents();expect(highlighted.map(x=>x.toLowerCase())).not.toContain(String(sample.hiddenSurface).toLowerCase())});

test('line with no play vocabulary has no Vocabulary section or highlight',async({page})=>{await ready(page);const sample=await page.evaluate(()=>{for(const scene of ['act1-scene1','act1-scene2','act2'])for(const speech of MTS_INDEX_ZERO.store.getScene(scene))if(MTS_INDEX_ZERO.store.getVocabulary(speech.id).length===0)return{scene,line:speech.id};return null});expect(sample).toBeTruthy();await page.goto(`${BASE}#/line?scene=${sample.scene}&line=${sample.line}`);await expect(page.getByRole('heading',{name:'Vocabulary'})).toHaveCount(0);await expect(page.locator('.word-row')).toHaveCount(0);await expect(page.locator('.line-detail-text .vocab-inline')).toHaveCount(0)});

test('Structure renders chunking-v1 markers and clause hierarchy without legacy role/type',async({page})=>{await ready(page);const sample=await page.evaluate(()=>{for(const scene of ['act1-scene1','act1-scene2','act2'])for(const speech of MTS_INDEX_ZERO.store.getScene(scene)){const s=MTS_INDEX_ZERO.store.getStructure(speech.id);if(s?.sentences?.some(x=>x.clauses?.length&&x.chunks?.some(c=>/^S\d/.test(c.marker))&&x.chunks?.some(c=>c.marker==='HV')))return{scene,line:speech.id}}return null});expect(sample).toBeTruthy();await page.goto(`${BASE}#/line?scene=${sample.scene}&line=${sample.line}`);await page.locator('.structure-summary').click();await expect(page.locator('[data-clause-marker]').first()).toBeVisible();await expect(page.locator('[data-marker="HV"]').first()).toBeVisible();await expect(page.locator('[data-marker^="S"]').first()).toBeVisible();await expect(page.getByText('S / V / O / C / M',{exact:true})).toHaveCount(0);await expect(page.getByText('undefined',{exact:true})).toHaveCount(0);await page.locator('[data-marker="HV"]').first().click();await expect(page.locator('.structure-info:not([hidden])')).toContainText('HV')});
'''
write('app/tests/canonical_study.e2e.spec.js',e2e)
pkg=read_json('app/package.json');cmd=pkg['scripts']['test:e2e'];token='tests/interpretation.e2e.spec.js';
if 'tests/canonical_study.e2e.spec.js' not in cmd: cmd=cmd.replace(token,token+' tests/canonical_study.e2e.spec.js')
pkg['scripts']['test:e2e']=cmd;write_json('app/package.json',pkg)

print(json.dumps({'status':'PASS','vocabulary':{'total':total,'playMeaning':visible,'neutralOnly':hidden},'buildId':'index-zero-2026-08-26-r7'}))
