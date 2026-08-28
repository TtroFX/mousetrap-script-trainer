from pathlib import Path
import json, re

ROOT=Path('.')

def read(path): return (ROOT/path).read_text(encoding='utf-8')
def write(path,text): (ROOT/path).write_text(text,encoding='utf-8')
def replace_once(text,old,new,label):
    if old not in text: raise RuntimeError(f'{label}: source fragment not found')
    if text.count(old)!=1: raise RuntimeError(f'{label}: expected one source fragment, got {text.count(old)}')
    return text.replace(old,new,1)
def regex_once(text,pattern,repl,label,flags=0):
    out,n=re.subn(pattern,repl,text,count=1,flags=flags)
    if n!=1: raise RuntimeError(f'{label}: expected one regex match, got {n}')
    return out

# Build/data path contract.
path=Path('app/src/config.js'); s=read(path)
s=replace_once(s,"export const BUILD_ID = 'index-zero-2026-08-28-r11';","export const BUILD_ID = 'index-zero-2026-08-28-r12';",'config build')
s=replace_once(s,"  script: './mousetrap_script_data.json',\n","  script: './mousetrap_script_data.json',\n  stage: './mousetrap_stage_directions.json',\n",'config stage path')
write(path,s)

path=Path('app/pwa-version.json'); v=json.loads(read(path)); v['buildId']='index-zero-2026-08-28-r12'; v['dataVersion']='canonical-2026-08-28-stage-directions-v1'; write(path,json.dumps(v,ensure_ascii=False,indent=2)+'\n')

path=Path('app/sw.js'); s=read(path)
s=replace_once(s,"const BUILD_ID='index-zero-2026-08-28-r11';","const BUILD_ID='index-zero-2026-08-28-r12';",'sw build')
s=replace_once(s,"  'mousetrap_script_data.json','mousetrap_line_translations.json'","  'mousetrap_script_data.json','mousetrap_stage_directions.json','mousetrap_line_translations.json'",'sw stage asset')
write(path,s)

# Runtime DataStore: stage data is core reader data, while the canonical speech projection remains 1164.
path=Path('app/src/data-store.js'); s=read(path)
stage_validator=r'''function validateStageDirections(value, script) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries)) throw new Error('stage: schema required');
  if (value.counts?.standalone !== 5 || value.counts?.attached !== 772 || value.counts?.total !== 777 || value.counts?.malformedBracketRecovered !== 1 || value.entries.length !== 777) throw new Error('stage: canonical counts invalid');
  const speechById = new Map();
  for (const scene of SCENES) for (const speech of script?.[scene.id]?.speeches || []) speechById.set(speech.id, scene.id);
  const ids = new Set(), placements = { before: 0, delivery: 0, after: 0 };
  let standalone = 0, attached = 0, malformed = 0;
  for (const entry of value.entries) {
    if (!entry || typeof entry !== 'object' || !String(entry.id || '').trim() || ids.has(entry.id) || !SCENES.some(scene => scene.id === entry.sceneId) || !String(entry.text || '').trim() || !String(entry.summaryJa || '').trim()) throw new Error(`stage: invalid entry ${entry?.id || '?'}`);
    ids.add(entry.id);
    if (!Array.isArray(entry.sourcePages) || !entry.sourcePages.length || entry.sourcePages.some(page => !Number.isInteger(page) || page < 1 || page > 84)) throw new Error(`stage.${entry.id}: invalid source pages`);
    if (!Array.isArray(entry.vocabulary) || !entry.vocabulary.length || entry.vocabulary.some(item => !String(item?.surface || '').trim() || !String(item?.lemma || '').trim() || !String(item?.meaning || '').trim() || !String(item?.note || '').trim())) throw new Error(`stage.${entry.id}: invalid vocabulary`);
    if (!Array.isArray(entry.notes) || !entry.notes.length || entry.notes.some(note => !String(note || '').trim())) throw new Error(`stage.${entry.id}: invalid notes`);
    if (entry.kind === 'scene-setting') {
      standalone += 1;
      const anchor = entry.anchor, ownerScene = speechById.get(String(anchor?.speechId || ''));
      if (!anchor || !['before','after'].includes(anchor.type) || ownerScene !== entry.sceneId || !Number.isInteger(anchor.order)) throw new Error(`stage.${entry.id}: invalid anchor`);
    } else if (entry.kind === 'stage-direction') {
      attached += 1;
      if (speechById.get(String(entry.speechId || '')) !== entry.sceneId || !['before','delivery','after'].includes(entry.placement)) throw new Error(`stage.${entry.id}: invalid speech/placement`);
      placements[entry.placement] += 1;
      if (entry.malformedSourceBracket === true) malformed += 1;
    } else throw new Error(`stage.${entry.id}: invalid kind`);
  }
  if (standalone !== 5 || attached !== 772 || malformed !== 1 || placements.before !== 236 || placements.delivery !== 411 || placements.after !== 125) throw new Error('stage: derived count contract invalid');
  return value;
}

'''
s=replace_once(s,'function expectedSpeechIds() {',stage_validator+'function expectedSpeechIds() {','data stage validator')
s=replace_once(s,'    this.script = null; this.translations = null; this.interpretation = null; this.vocabulary = null; this.grammar = null; this.dictionary = null; this.structure = null;','    this.script = null; this.stageDirections = null; this.translations = null; this.interpretation = null; this.vocabulary = null; this.grammar = null; this.dictionary = null; this.structure = null;','data constructor stage')
s=replace_once(s,'    this.speechById = new Map(); this.sceneBySpeech = new Map();','    this.speechById = new Map(); this.sceneBySpeech = new Map(); this.stageById = new Map(); this.stageBySpeech = new Map(); this.stageStandaloneByScene = new Map();','data constructor maps')
old_core='''        this.metrics.requests += 1;
        const script = validateScript(await fetchJson(DATA_PATHS.script, CORE_TIMEOUT_MS));
        this.script = script; this.speechById.clear(); this.sceneBySpeech.clear();
        for (const scene of SCENES) for (const speech of script[scene.id].speeches) { this.speechById.set(speech.id, speech); this.sceneBySpeech.set(speech.id, scene.id); }'''
new_core='''        this.metrics.requests += 2;
        const [scriptRaw, stageRaw] = await Promise.all([fetchJson(DATA_PATHS.script, CORE_TIMEOUT_MS), fetchJson(DATA_PATHS.stage, CORE_TIMEOUT_MS)]);
        const script = validateScript(scriptRaw), stageDirections = validateStageDirections(stageRaw, script);
        this.script = script; this.stageDirections = stageDirections; this.speechById.clear(); this.sceneBySpeech.clear(); this.stageById.clear(); this.stageBySpeech.clear(); this.stageStandaloneByScene.clear();
        for (const scene of SCENES) for (const speech of script[scene.id].speeches) { this.speechById.set(speech.id, speech); this.sceneBySpeech.set(speech.id, scene.id); }
        for (const entry of stageDirections.entries) {
          this.stageById.set(entry.id, entry);
          if (entry.kind === 'stage-direction') { const rows = this.stageBySpeech.get(entry.speechId) || []; rows.push(entry); this.stageBySpeech.set(entry.speechId, rows); }
          else { const rows = this.stageStandaloneByScene.get(entry.sceneId) || []; rows.push(entry); this.stageStandaloneByScene.set(entry.sceneId, rows); }
        }'''
s=replace_once(s,old_core,new_core,'data load core')
s=replace_once(s,"  hasCore() { return this.coreState.status === 'ready' && !!this.script; }","  hasCore() { return this.coreState.status === 'ready' && !!this.script && !!this.stageDirections; }",'data hasCore')
stage_methods=r'''  getStageById(stageId) { return this.stageById.get(stageId) || null; }
  getStageDirectionsForSpeech(lineId) { return [...(this.stageBySpeech.get(lineId) || [])]; }
  getStandaloneStageDirections(sceneId) { return [...(this.stageStandaloneByScene.get(sceneId) || [])].sort((a,b) => (a.anchor?.order || 0) - (b.anchor?.order || 0)); }
  getReaderSequence(sceneId) {
    const speeches = this.getScene(sceneId), settings = this.getStandaloneStageDirections(sceneId), before = new Map(), after = new Map();
    for (const stage of settings) { const map = stage.anchor?.type === 'after' ? after : before, key = stage.anchor?.speechId; const rows = map.get(key) || []; rows.push(stage); map.set(key, rows); }
    const sequence = [];
    for (const speech of speeches) {
      for (const stage of before.get(speech.id) || []) sequence.push({ kind: 'stage', id: stage.id, stage });
      sequence.push({ kind: 'speech', id: speech.id, speech });
      for (const stage of after.get(speech.id) || []) sequence.push({ kind: 'stage', id: stage.id, stage });
    }
    return sequence;
  }
'''
s=replace_once(s,'  getSpeechById(lineId) { return this.speechById.get(lineId) || null; }',stage_methods+'  getSpeechById(lineId) { return this.speechById.get(lineId) || null; }','data methods')
write(path,s)

# Reader / line-detail / standalone Situation pages.
path=Path('app/src/main.js'); s=read(path)
s=regex_once(s,r'^function readerRows\(scene,mode,role\)\{.*$',"function readerRows(scene,mode,role){const rows=store.getScene(scene);if(mode==='full')return store.getReaderSequence(scene).map(item=>item.kind==='stage'?{stage:item.stage,kind:'stage'}:{speech:item.speech,kind:'full'});if(!role)return[];if(mode==='mine')return rows.filter(x=>x.speaker===role).map(speech=>({speech,kind:'target'}));const wanted=new Map();for(let i=0;i<rows.length;i++){if(rows[i].speaker!==role)continue;if(i>0)wanted.set(rows[i-1].id,{speech:rows[i-1],kind:'cue'});wanted.set(rows[i].id,{speech:rows[i],kind:'target'})}return rows.filter(x=>wanted.has(x.id)).map(x=>wanted.get(x.id))}",'main readerRows',re.M)
helpers=r'''function stageLearningHtml(stage,expanded=false){const vocab=(stage.vocabulary||[]).map(item=>`<div class="stage-vocab-row"><b>${esc(item.surface)} · ${esc(item.meaning)}</b><span>${esc(item.lemma)}</span><p>${esc(item.note)}</p></div>`).join(''),notes=(stage.notes||[]).map(note=>`<li>${esc(note)}</li>`).join('');return `<details class="stage-learning" ${expanded?'open':''}><summary>Vocabulary & notes</summary>${vocab?`<div class="stage-vocab-list">${vocab}</div>`:''}${notes?`<ul class="stage-notes">${notes}</ul>`:''}</details>`}
function stageSourceHtml(stage){return `<span class="stage-source">PDF ${stage.sourcePages.map(page=>`p.${page}`).join(' · ')}</span>`}
function stageContextHtml(entries){if(!Array.isArray(entries)||!entries.length)return'';return `<section class="stage-context-block" aria-label="Situation details"><div class="stage-context-kicker">Situation</div>${entries.map(stage=>`<div class="stage-context-item" data-stage-direction="${esc(stage.id)}"><div class="stage-meta"><span>${esc(stage.placement==='delivery'?'Delivery':stage.placement==='before'?'Before line':'After line')}</span>${stageSourceHtml(stage)}</div><p class="stage-direction-text">${esc(stage.text)}</p><p class="stage-summary-ja">${esc(stage.summaryJa)}</p>${stageLearningHtml(stage)}</div>`).join('')}</section>`}
function readerRowHtml(row,role,mode){if(row.kind==='stage'){const stage=row.stage;return `<button class="line-row stage-row" id="${esc(stage.id)}" data-stage-page="${esc(stage.id)}"><span class="speaker stage-speaker">SITUATION</span><span class="line-text stage-list-text">${esc(stage.text)}</span><span class="stage-list-summary">${esc(stage.summaryJa)}</span></button>`}const {speech,kind}=row;return `<button class="line-row ${kind==='cue'?'cue-row':''} ${kind==='target'?'target-row':''} ${role&&speech.speaker===role?'selected-role-line':''}" id="${esc(speech.id)}" data-line="${esc(speech.id)}"><span class="speaker">${esc(speech.speaker)}${kind==='cue'?'<small>CUE</small>':kind==='target'&&mode==='cue'?'<small>YOUR LINE</small>':''}</span><span class="line-text">${annotatedText(speech.text,speech.id)}</span></button>`}
function openStage(scene,stageId){const stage=store.getStageById(stageId);if(!stage||stage.sceneId!==scene||stage.kind!=='scene-setting')return;state.setScene(scene);go(`#/stage?scene=${encodeURIComponent(scene)}&stage=${encodeURIComponent(stageId)}`)}
function openReaderItem(scene,item){if(!item)return;if(item.kind==='stage')openStage(scene,item.stage.id);else openLine(scene,item.speech.id)}
'''
s=replace_once(s,'function scriptView(q){',helpers+'function scriptView(q){','main helpers')
script_view="""function scriptView(q){const token=routeGeneration;if(!renderCoreState('Script','script',token))return;const scene=state.selectedScene(),role=state.role();let mode=state.readerMode();if((mode==='mine'||mode==='cue')&&!role)mode=state.setReaderMode('full');const rows=readerRows(scene,mode,role),stagePages=store.getStandaloneStageDirections(scene).length,countText=mode==='full'?`${store.getScene(scene).length} lines · ${stagePages} situation pages`:`${rows.length}/${store.getScene(scene).length} lines shown`;chrome(`<section class=\"card\"><div class=\"eyebrow\">Script</div><h2>${esc(sceneMeta(scene).label)}</h2><div class=\"toolbar\"><button class=\"ghost-btn\" data-scene-picker>Scene</button>${['full','mine','cue'].map(id=>`<button class=\"ghost-btn ${mode===id?'selected-tool':''}\" data-reader-mode=\"${id}\">${id==='full'?'Full':id==='mine'?'Mine':'Cue Focus'}</button>`).join('')}<button class=\"ghost-btn\" data-open-search>Search</button></div><p class=\"muted\">Role: ${esc(role||'Not selected')} · ${countText}</p></section><section class=\"reader-list\">${rows.length?rows.map(row=>readerRowHtml(row,role,mode)).join(''):'<div class=\"card\"><p class=\"muted\">This role has no lines in this scene.</p></div>'}</section>`,'script');app.querySelector('[data-scene-picker]').onclick=()=>go('#/scene');app.querySelector('[data-open-search]').onclick=()=>go('#/search');app.querySelectorAll('[data-reader-mode]').forEach(b=>b.onclick=()=>{const m=b.dataset.readerMode;if((m==='mine'||m==='cue')&&!state.role()){toast('Choose a role first');go('#/more');return}state.setReaderMode(m);renderRoute()});app.querySelectorAll('[data-line]').forEach(b=>b.onclick=e=>{if(!e.target.closest('[data-word-line]'))openLine(scene,b.dataset.line)});app.querySelectorAll('[data-stage-page]').forEach(b=>b.onclick=()=>openStage(scene,b.dataset.stagePage));bindWordButtons();const focusLine=q.get('line'),focusStage=q.get('stage');if(focusLine&&store.getSpeech(scene,focusLine))requestAnimationFrame(()=>document.getElementById(focusLine)?.scrollIntoView({block:'center'}));else if(focusStage&&store.getStageById(focusStage))requestAnimationFrame(()=>document.getElementById(focusStage)?.scrollIntoView({block:'center'}))}\nfunction sceneView"""
s=regex_once(s,r'function scriptView\(q\)\{.*\}\nfunction sceneView',script_view,'main scriptView',re.S)
line_stage=r'''function openLine(scene,line){if(!store.getSpeech(scene,line))return;state.setScene(scene);state.markReaderSeen(scene,line);go(`#/line?scene=${encodeURIComponent(scene)}&line=${encodeURIComponent(line)}`)}
function lineView(q){const scene=q.get('scene'),line=q.get('line'),token=routeGeneration;if(!renderCoreState('Line Detail','script',token))return;const speech=store.getSpeech(scene,line);if(!speech){go('#/script');return}state.setScene(scene);state.markReaderSeen(scene,line);const study=store.hasStudy(),structReady=store.hasStructure(),translation=study?store.getTranslation(line):'',interpretation=study?store.getInterpretation(line):[],grammar=study?store.getGrammar(line):[],vocab=study?store.getVocabulary(line):[],structure=structReady?store.getStructure(line):null,stageEntries=store.getStageDirectionsForSpeech(line),sequence=store.getReaderSequence(scene),i=sequence.findIndex(item=>item.kind==='speech'&&item.speech.id===line),prev=sequence[i-1],next=sequence[i+1];const grammarHtml=study&&grammar.length?`<h3>Grammar / Usage</h3>${grammar.map(g=>`<div class="grammar-item"><b>${esc(g.pattern)}</b><p>${esc(g.description)}</p></div>`).join('')}`:'',vocabHtml=study&&vocab.length?`<h3>Vocabulary</h3>${vocab.map((v,n)=>`<button class="word-row" data-detail-word="${n}"><b>${esc(v.surface)} · ${esc(v.meaning)}</b><span>${esc(v.lemma)}</span></button>`).join('')}`:'',studyCard=grammarHtml||vocabHtml?`<div class="card study-notes">${grammarHtml}${vocabHtml}</div>`:'';chrome(`<section class="line-page"><div class="card"><div class="speaker-title">${esc(speech.speaker)}</div><p class="line-detail-text">${annotatedText(speech.text,line)}</p><span class="chip">${esc(sceneMeta(scene).label)}</span></div><div class="card" data-translation-card>${stageContextHtml(stageEntries)}<div class="eyebrow">Translation</div>${study?`<p class="translation">${esc(translation||'No translation available.')}</p>${interpretationHtml(interpretation)}`:store.studyState.status==='error'?'<p class="error-text">Translation and study notes could not be loaded.</p>':'<p class="micro-status">Loading translation and study notes…</p>'}</div>${studyCard}<div class="card" data-structure-card>${structReady?`<details class="structure-details"><summary class="structure-summary"><span>Structure</span><small>Clause hierarchy · S / V / O / C · connectors</small></summary>${renderStructure(speech,structure)}</details>`:store.structureState.status==='error'?'<p class="error-text">Structure could not be loaded.</p>':'<p class="micro-status">Loading Structure…</p>'}</div><div class="card"><div class="toolbar"><button class="primary-btn" data-line-cue>Cue Practice</button><button class="ghost-btn" data-line-rehearsal>Rehearsal</button></div></div><div class="floating-nav"><button data-prev ${prev?'':'disabled'}>‹</button><button data-close-line>×</button><button data-next ${next?'':'disabled'}>›</button></div></section>`,'script');bindWordButtons();app.querySelectorAll('[data-detail-word]').forEach(b=>b.onclick=()=>{const v=vocab[Number(b.dataset.detailWord)];if(v)dictionarySheet.open(line,v.lemma,v.surface)});app.querySelector('[data-line-cue]').onclick=()=>go(`#/cue?scene=${encodeURIComponent(scene)}&line=${encodeURIComponent(line)}`);app.querySelector('[data-line-rehearsal]').onclick=()=>go(`#/rehearsal?scene=${encodeURIComponent(scene)}&line=${encodeURIComponent(line)}`);app.querySelector('[data-prev]').onclick=()=>openReaderItem(scene,prev);app.querySelector('[data-next]').onclick=()=>openReaderItem(scene,next);app.querySelector('[data-close-line]').onclick=()=>go(`#/script?line=${encodeURIComponent(line)}`);bindStructureInteractions(app,speech,structure);if(!study&&store.studyState.status==='idle')store.loadStudy().then(()=>token===routeGeneration&&renderRoute()).catch(()=>token===routeGeneration&&renderRoute());if(!structReady&&store.structureState.status==='idle')store.loadStructure().then(()=>token===routeGeneration&&renderRoute()).catch(()=>token===routeGeneration&&renderRoute());if(store.studyState.status==='error'){app.querySelector('[data-translation-card]')?.insertAdjacentHTML('beforeend','<button class="ghost-btn" data-retry-study>Retry study data</button>');app.querySelector('[data-retry-study]')?.addEventListener('click',()=>store.loadStudy({force:true}).then(renderRoute).catch(renderRoute))}if(store.structureState.status==='error'){app.querySelector('[data-structure-card]')?.insertAdjacentHTML('beforeend','<button class="ghost-btn" data-retry-structure>Retry Structure</button>');app.querySelector('[data-retry-structure]')?.addEventListener('click',()=>store.loadStructure({force:true}).then(renderRoute).catch(renderRoute))}}
function stageView(q){const scene=q.get('scene'),stageId=q.get('stage'),token=routeGeneration;if(!renderCoreState('Situation','script',token))return;const stage=store.getStageById(stageId);if(!stage||stage.sceneId!==scene||stage.kind!=='scene-setting'){go('#/script');return}state.setScene(scene);const sequence=store.getReaderSequence(scene),i=sequence.findIndex(item=>item.kind==='stage'&&item.stage.id===stageId),prev=sequence[i-1],next=sequence[i+1];chrome(`<section class="line-page stage-page"><div class="card stage-page-card"><div class="eyebrow stage-context-kicker">Situation</div><p class="stage-page-text">${esc(stage.text)}</p><p class="stage-summary-ja">${esc(stage.summaryJa)}</p><div class="stage-meta">${stageSourceHtml(stage)}</div>${stageLearningHtml(stage,true)}</div><div class="floating-nav"><button data-prev ${prev?'':'disabled'}>‹</button><button data-close-stage>×</button><button data-next ${next?'':'disabled'}>›</button></div></section>`,'script');app.querySelector('[data-prev]').onclick=()=>openReaderItem(scene,prev);app.querySelector('[data-next]').onclick=()=>openReaderItem(scene,next);app.querySelector('[data-close-stage]').onclick=()=>go(`#/script?stage=${encodeURIComponent(stageId)}`)}'''
s=regex_once(s,r'function openLine\(scene,line\)\{.*\}\nfunction lineView\(q\)\{.*\}',line_stage,'main line/stage views',re.S)
s=replace_once(s,"case'/line':lineView(q);break;","case'/line':lineView(q);break;case'/stage':stageView(q);break;",'main stage route')
write(path,s)

# Focus gesture navigation now traverses the same Reader sequence, including standalone Situation pages.
path=Path('app/src/gesture-controls.js'); s=read(path)
focus_block=r'''const focusRoute=()=>{
  const raw=location.hash.replace(/^#/,'');
  const [path,query='']=raw.split('?'),q=new URLSearchParams(query),scene=q.get('scene');
  if(path==='/line'){const line=q.get('line');return scene&&line?{scene,id:line,kind:'speech'}:null}
  if(path==='/stage'){const stage=q.get('stage');return scene&&stage?{scene,id:stage,kind:'stage'}:null}
  return null;
};
const lineRoute=()=>{const route=focusRoute();return route?.kind==='speech'?{scene:route.scene,line:route.id}:null};
const syncFocusRole=()=>{
  const page=document.querySelector('.line-page');
  if(!page)return;
  const card=page.querySelector(':scope > .card');
  const route=lineRoute(),api=window.MTS_INDEX_ZERO;
  if(!card||!api?.store||!api?.state)return;
  if(!route){card.classList.remove('selected-role-line','focus-role-line');delete card.dataset.ownRole;return}
  const speech=api.store.getSpeech(route.scene,route.line),role=api.state.role?.();
  const mine=!!role&&speech?.speaker===role;
  card.classList.toggle('selected-role-line',mine);
  card.classList.toggle('focus-role-line',mine);
  if(mine)card.dataset.ownRole='true';else delete card.dataset.ownRole;
};
const scheduleFocusRoleSync=()=>requestAnimationFrame(syncFocusRole);
const resetFocusScroll=()=>{
  if(!focusRoute())return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'})));
};
const moveFocusLine=direction=>{
  const route=focusRoute(),api=window.MTS_INDEX_ZERO;
  if(!route||!api?.store?.getReaderSequence)return false;
  const rows=api.store.getReaderSequence(route.scene),index=rows.findIndex(item=>item.kind===route.kind&&item.id===route.id);
  if(index<0)return false;
  const target=rows[index+(direction>0?1:-1)];
  if(!target)return false;
  location.hash=target.kind==='stage'?`#/stage?scene=${encodeURIComponent(route.scene)}&stage=${encodeURIComponent(target.stage.id)}`:`#/line?scene=${encodeURIComponent(route.scene)}&line=${encodeURIComponent(target.speech.id)}`;
  return true;
};
let focusSwipe=null;'''
s=regex_once(s,r'const lineRoute=\(\)=>\{.*?let focusSwipe=null;',focus_block,'gesture focus block',re.S)
s=s.replace('version:3,closeSheet','version:4,closeSheet')
write(path,s)

# Stage visual system: PDF-derived text is blue; attached context is compact but all vocabulary/notes remain available.
path=Path('app/src/app.css'); s=read(path)
css=r'''

/* pdf-stage-directions-r1 */
:root{--stage-blue:#2d4b7c;--stage-blue-soft:#eef3fa;--stage-blue-line:#b9c8dc}
.stage-row{border-color:var(--stage-blue-line);background:linear-gradient(135deg,#fff 0%,var(--stage-blue-soft) 100%)}
.stage-row .stage-speaker,.stage-context-kicker{color:var(--stage-blue)!important}
.stage-list-text,.stage-page-text,.stage-direction-text{color:var(--stage-blue);font:650 17px/1.65 Georgia,"Times New Roman",serif}
.stage-list-summary,.stage-summary-ja{display:block;color:#4e5968;font-size:13px;line-height:1.7;margin-top:7px}
.stage-context-block{margin:0 0 14px;padding:12px;border:1px solid var(--stage-blue-line);border-radius:15px;background:var(--stage-blue-soft)}
.stage-context-kicker{font-size:10px;font-weight:900;letter-spacing:.11em;text-transform:uppercase;margin-bottom:7px}
.stage-context-item+.stage-context-item{border-top:1px solid var(--stage-blue-line);margin-top:12px;padding-top:12px}
.stage-context-item .stage-direction-text{margin:.35em 0}.stage-context-item .stage-summary-ja{margin:.35em 0}
.stage-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#637086;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.stage-source{white-space:nowrap}.stage-page-card{border-color:var(--stage-blue-line);background:linear-gradient(160deg,#fff 0%,var(--stage-blue-soft) 100%)}
.stage-page-text{font-size:clamp(20px,5vw,28px);font-weight:700}.stage-page .stage-summary-ja{font-size:15px;color:#3f4a59}
.stage-learning{margin-top:11px;border-top:1px solid var(--stage-blue-line);padding-top:9px}.stage-learning summary{color:var(--stage-blue);font-size:12px}
.stage-vocab-list{display:grid;gap:7px;margin-top:9px}.stage-vocab-row{border:1px solid #ced9e8;border-radius:11px;background:rgba(255,255,255,.72);padding:9px 10px}.stage-vocab-row b{display:block;font-size:13px}.stage-vocab-row span{display:block;color:#647084;font-size:11px;margin-top:2px}.stage-vocab-row p{margin:5px 0 0;color:#4f5b69;font-size:12px;line-height:1.55}.stage-notes{margin:10px 0 0;padding-left:20px;color:#4f5b69;font-size:12px;line-height:1.6}
'''
if '/* pdf-stage-directions-r1 */' not in s: s+=css
write(path,s)

# Production assembly includes and validates the new canonical data without changing the five-file legacy contract.
path=Path('app/scripts/assemble-production.mjs'); s=read(path)
stage_assembly="""const stagePath=path.join(rootDir,'mousetrap_stage_directions.json');
if(!fs.existsSync(stagePath))fail('canonical stage directions missing');
const stageDirections=readJson(stagePath);
if(stageDirections.schemaVersion!==1||stageDirections.counts?.standalone!==5||stageDirections.counts?.attached!==772||stageDirections.counts?.total!==777||stageDirections.entries?.length!==777)fail('stage-direction canonical contract invalid');
let stageStandalone=0,stageAttached=0,stageMalformed=0;
for(const entry of stageDirections.entries){if(!entry?.id||!entry?.sceneId||!entry?.text||!entry?.summaryJa||!Array.isArray(entry.vocabulary)||!entry.vocabulary.length||!Array.isArray(entry.notes)||!entry.notes.length)fail(`stage-direction invalid ${entry?.id||'?'}`);if(entry.kind==='scene-setting')stageStandalone++;else if(entry.kind==='stage-direction'){stageAttached++;if(entry.malformedSourceBracket===true)stageMalformed++;}else fail(`stage-direction kind ${entry.id}`)}
if(stageStandalone!==5||stageAttached!==772||stageMalformed!==1)fail('stage-direction derived counts invalid');

"""
s=replace_once(s,"const structurePath=path.join(appDir,'mousetrap_line_structure.json');",stage_assembly+"const structurePath=path.join(appDir,'mousetrap_line_structure.json');",'assembly stage validate')
s=replace_once(s,"  copy(structurePath,path.join(outDir,'mousetrap_line_structure.json'));","  copy(structurePath,path.join(outDir,'mousetrap_line_structure.json'));\n  copy(stagePath,path.join(outDir,'mousetrap_stage_directions.json'));",'assembly stage copy')
s=replace_once(s,"  files['mousetrap_line_structure.json']=sha(path.join(outDir,'mousetrap_line_structure.json'));","  files['mousetrap_line_structure.json']=sha(path.join(outDir,'mousetrap_line_structure.json'));\n  files['mousetrap_stage_directions.json']=sha(path.join(outDir,'mousetrap_stage_directions.json'));",'assembly stage hash')
s=s.replace('structureChunks:11810},files','structureChunks:11810,stageDirections:777,stageStandalone:5,stageAttached:772},files')
s=s.replace('structureChunks:11810}},null,2)','structureChunks:11810,stageDirections:777,stageStandalone:5,stageAttached:772}},null,2)')
write(path,s)

# Offline contracts include the stage data.
for name in ['app/tests/offline_pwa_static.mjs','app/tests/offline_pwa.e2e.spec.js']:
    path=Path(name); s=read(path)
    s=replace_once(s,"'mousetrap_script_data.json','mousetrap_line_translations.json'","'mousetrap_script_data.json','mousetrap_stage_directions.json','mousetrap_line_translations.json'",f'{name} stage offline asset')
    write(path,s)

# Static architecture contract for the new feature.
path=Path('app/tests/index_zero_static.mjs'); s=read(path)
extra="""
const stageConfig=read('src/config.js');
if(!stageConfig.includes("stage: './mousetrap_stage_directions.json'"))fail('stage-direction DATA_PATH missing');
for(const term of ['validateStageDirections','getStageDirectionsForSpeech','getStandaloneStageDirections','getReaderSequence','getStageById'])if(!data.includes(term))fail('stage-direction DataStore contract missing: '+term);
for(const term of ['stageContextHtml','stageView','data-stage-page',"case'/stage':stageView(q)"])if(!main.includes(term))fail('stage-direction Reader contract missing: '+term);
if(!sw.includes("'mousetrap_stage_directions.json'"))fail('stage-direction data missing from offline cache');
if(!css.includes('--stage-blue:#2d4b7c')||!css.includes('.stage-direction-text'))fail('stage-direction blue visual contract missing');
"""
if 'stage-direction DATA_PATH missing' not in s: s+='\n'+extra
write(path,s)

# Browser QA covers standalone pages, attached placement above Translation, and complete learning notes.
stage_test=r'''const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';
async function ready(page){await page.goto(BASE,{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();await page.waitForFunction(()=>MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:15000})}

test('PDF Situation pages and attached stage directions are integrated into Reader',async({page})=>{
  await ready(page);
  const sample=await page.evaluate(()=>{
    const scene='act1-scene1',standalone=MTS_INDEX_ZERO.store.getStandaloneStageDirections(scene)[0];
    let attached=null;
    for(const speech of MTS_INDEX_ZERO.store.getScene(scene)){const rows=MTS_INDEX_ZERO.store.getStageDirectionsForSpeech(speech.id);if(rows.length){attached={speech,rows};break}}
    return {scene,standalone,attached};
  });
  expect(sample.standalone).toBeTruthy();expect(sample.attached).toBeTruthy();
  await page.goto(`${BASE}#/script`);
  const stageRow=page.locator(`[data-stage-page="${sample.standalone.id}"]`);
  await expect(stageRow).toBeVisible();
  await stageRow.click();
  await expect(page).toHaveURL(new RegExp(`/stage\\?scene=${sample.scene}`));
  await expect(page.locator('.stage-page-card')).toBeVisible();
  expect(await page.locator('.stage-page-text').evaluate(el=>getComputedStyle(el).color)).toBe('rgb(45, 75, 124)');
  await expect(page.locator('.stage-summary-ja')).toHaveText(sample.standalone.summaryJa);
  await expect(page.locator('.stage-vocab-row')).toHaveCount(sample.standalone.vocabulary.length);
  await expect(page.locator('.stage-notes li')).toHaveCount(sample.standalone.notes.length);
  await page.locator('[data-next]').click();
  await expect(page).toHaveURL(/#\/line\?/);

  await page.goto(`${BASE}#/line?scene=${sample.scene}&line=${sample.attached.speech.id}`);
  await expect(page.locator('.stage-context-block')).toBeVisible();
  await expect(page.locator('.stage-context-item')).toHaveCount(sample.attached.rows.length);
  expect(await page.locator('.stage-direction-text').first().evaluate(el=>getComputedStyle(el).color)).toBe('rgb(45, 75, 124)');
  const order=await page.evaluate(()=>{const block=document.querySelector('.stage-context-block'),translation=document.querySelector('.translation');return !!block&&!!translation&&!!(block.compareDocumentPosition(translation)&Node.DOCUMENT_POSITION_FOLLOWING)});
  expect(order).toBe(true);
  for(let i=0;i<sample.attached.rows.length;i++){
    const row=sample.attached.rows[i],item=page.locator('.stage-context-item').nth(i);
    await expect(item.locator('.stage-summary-ja')).toHaveText(row.summaryJa);
    await item.locator('.stage-learning summary').click();
    await expect(item.locator('.stage-vocab-row')).toHaveCount(row.vocabulary.length);
    await expect(item.locator('.stage-notes li')).toHaveCount(row.notes.length);
  }
});

test('Practice speech projection remains exactly 1164 after Situation integration',async({page})=>{
  await ready(page);
  const counts=await page.evaluate(()=>({speeches:['act1-scene1','act1-scene2','act2'].reduce((n,scene)=>n+MTS_INDEX_ZERO.store.getScene(scene).length,0),stagePages:['act1-scene1','act1-scene2','act2'].reduce((n,scene)=>n+MTS_INDEX_ZERO.store.getStandaloneStageDirections(scene).length,0),readerItems:['act1-scene1','act1-scene2','act2'].reduce((n,scene)=>n+MTS_INDEX_ZERO.store.getReaderSequence(scene).length,0)}));
  expect(counts).toEqual({speeches:1164,stagePages:5,readerItems:1169});
});
'''
write(Path('app/tests/stage_directions.e2e.spec.js'),stage_test)

# Permanent CI and Pages deployment validate and publish the canonical stage data.
path=Path('.github/workflows/app-qa.yml'); s=read(path)
s=replace_once(s,'          node scripts/validate-vocabulary-semantics.mjs\n','          node scripts/validate-vocabulary-semantics.mjs\n          node scripts/validate-stage-directions.mjs\n','app qa validator')
s=replace_once(s,'          test -e ../public/mousetrap_line_interpretation.json\n','          test -e ../public/mousetrap_line_interpretation.json\n          test -e ../public/mousetrap_stage_directions.json\n','app qa artifact')
write(path,s)

path=Path('.github/workflows/pages.yml'); s=read(path)
s=replace_once(s,'          node scripts/validate-vocabulary-semantics.mjs\n','          node scripts/validate-vocabulary-semantics.mjs\n          node scripts/validate-stage-directions.mjs\n','pages validator')
s=replace_once(s,'          test -e public/mousetrap_script_data.json\n','          test -e public/mousetrap_script_data.json\n          test -e public/mousetrap_stage_directions.json\n','pages artifact')
write(path,s)

# Sanity assertions for the migration itself.
for required in [
  ('app/src/config.js','index-zero-2026-08-28-r12'),
  ('app/src/config.js','mousetrap_stage_directions.json'),
  ('app/src/data-store.js','getReaderSequence'),
  ('app/src/main.js','stageContextHtml'),
  ('app/src/main.js',"case'/stage':stageView(q)"),
  ('app/sw.js','mousetrap_stage_directions.json'),
  ('app/src/app.css','--stage-blue:#2d4b7c'),
  ('app/scripts/assemble-production.mjs','stageDirections:777'),
]:
    if required[1] not in read(Path(required[0])): raise RuntimeError(f'migration assertion failed {required}')
print(json.dumps({'status':'PASS','buildId':'index-zero-2026-08-28-r12','stageEntries':777,'standalonePages':5,'attachedDirections':772},indent=2))
