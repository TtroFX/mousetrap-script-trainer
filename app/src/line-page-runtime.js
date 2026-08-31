import { SCENES } from './config.js';
import { pageForLine } from './pdf-pages.js';
import { renderStructure } from './study/structure-view.js';

export const PENDING_CLASS='line-nav-v2-route-pending';
export const COMMIT_EASING='cubic-bezier(.2,.78,.2,1)';
export const SETTLE_EASING='cubic-bezier(.22,.72,.24,1)';
export const motionProfile=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?{settle:80,commit:110}:{settle:150,commit:205};
export const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
export const twoFrames=()=>nextFrame().then(nextFrame);

const SHIORI_STORAGE_KEY='mts.shiori.v1';
const INTERPRETATION_LABELS=Object.freeze({
  joke:'Joke',foreshadowing:'Foreshadowing',truth:'Truth',lie:'Lie',
  concealment:'Concealment',feignedIgnorance:'Feigning ignorance',
  misdirection:'Misdirection',evasion:'Evasion',mistakenBelief:'Mistaken belief'
});
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const sceneLabel=id=>SCENES.find(scene=>scene.id===id)?.label||id;

const style=document.createElement('style');
style.textContent=`
.${PENDING_CLASS} #app .line-page{visibility:hidden!important}
.line-nav-v2-overlay{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:2147483000;contain:layout style paint}
.line-nav-v2-overlay .line-page-surface,.line-nav-v2-overlay .focus-page-preview{box-sizing:border-box;pointer-events:none}
.line-nav-v2-overlay .floating-nav{pointer-events:none!important}
`;
document.head.append(style);

export const apiReady=new Promise(resolve=>{
  const probe=()=>{
    const api=window.MTS_INDEX_ZERO;
    if(api?.store&&api?.state){resolve(api);return}
    requestAnimationFrame(probe);
  };
  probe();
});

let dataPromise=null;
export async function ensureRequiredData(){
  const api=await apiReady,store=api.store;
  if(dataPromise)return dataPromise;
  dataPromise=(async()=>{
    if(!store.hasCore?.()&&store.coreState?.status!=='error')await store.loadCore?.();
    const jobs=[];
    if(!store.hasStudy?.()&&store.studyState?.status!=='error')jobs.push(store.loadStudy?.());
    if(!store.hasStructure?.()&&store.structureState?.status!=='error')jobs.push(store.loadStructure?.());
    if(!store.hasStageDirections?.()&&store.stageState?.status!=='error')jobs.push(store.loadStageDirections?.());
    await Promise.allSettled(jobs.filter(Boolean));
    return api;
  })();
  return dataPromise;
}
export function visualDataReady(){
  const store=window.MTS_INDEX_ZERO?.store;
  if(!store)return false;
  return !!(
    (store.hasStudy?.()||store.studyState?.status==='error')&&
    (store.hasStructure?.()||store.structureState?.status==='error')&&
    (store.hasStageDirections?.()||store.stageState?.status==='error')
  );
}
apiReady.then(()=>ensureRequiredData()).catch(()=>{});

export function readRoute(hash=location.hash){
  const raw=String(hash||'').replace(/^#/,'');
  const [path,query='']=raw.split('?');
  if(path!=='/line')return null;
  const q=new URLSearchParams(query),scene=q.get('scene'),line=q.get('line');
  return scene&&line?{scene,line}:null;
}
export const routeHash=route=>`#/line?scene=${encodeURIComponent(route.scene)}&line=${encodeURIComponent(route.line)}`;
export function adjacentRoute(route,direction){
  const store=window.MTS_INDEX_ZERO?.store;
  if(!route||!store)return null;
  const rows=store.getScene(route.scene),index=rows.findIndex(row=>row.id===route.line);
  if(index<0)return null;
  const speech=rows[index+(direction>0?1:-1)];
  return speech?{scene:route.scene,line:speech.id}:null;
}

function vocabRanges(text,vocab){
  const candidates=[],lower=String(text||'').toLowerCase(),isWord=ch=>!!ch&&/[A-Za-z0-9'’\-]/.test(ch);
  for(const entry of vocab||[]){
    const surface=String(entry?.surface||'').trim();
    if(!surface)continue;
    const needle=surface.toLowerCase();
    let from=0;
    while(from<=lower.length-needle.length){
      const start=lower.indexOf(needle,from);
      if(start<0)break;
      const end=start+needle.length;
      if(!(isWord(surface[0])&&isWord(text[start-1]))&&!(isWord(surface[surface.length-1])&&isWord(text[end])))candidates.push({start,end,entry});
      from=start+Math.max(1,needle.length);
    }
  }
  candidates.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start));
  const out=[];let edge=0;
  for(const item of candidates){if(item.start<edge)continue;out.push(item);edge=item.end}
  return out;
}
function annotatedText(text,lineId,store){
  if(!store.hasStudy?.())return esc(text);
  const ranges=vocabRanges(text,store.getVocabulary(lineId));
  let out='',cursor=0;
  for(const range of ranges){
    out+=esc(text.slice(cursor,range.start));
    const surface=text.slice(range.start,range.end);
    out+=`<span class="vocab-inline" aria-hidden="true">${esc(surface)}</span>`;
    cursor=range.end;
  }
  return out+esc(text.slice(cursor));
}
function interpretationHtml(notes){
  if(!Array.isArray(notes)||!notes.length)return'';
  return `<div class="translation-interpretation"><div class="interpretation-kicker">Interpretation</div>${notes.map(note=>{
    const label=INTERPRETATION_LABELS[note.kind];
    return `<div class="interpretation-note">${label?`<span class="interpretation-badge" data-kind="${esc(note.kind)}">${esc(label)}</span>`:''}<p>${esc(note.text)}</p></div>`;
  }).join('')}</div>`;
}
function shioriEntry(){
  try{
    const parsed=JSON.parse(localStorage.getItem(SHIORI_STORAGE_KEY)||'null');
    return parsed&&parsed.sceneId&&parsed.lineId?parsed:null;
  }catch{return null}
}
function bookmarkHolderHtml(route,state){
  const bookmarked=!!state.isBookmarked?.(route.line),shiori=shioriEntry()?.lineId===route.line;
  return `<div class="line-bookmark-holder" aria-hidden="true">
    <span class="bookmark-toggle shiori-toggle ${shiori?'active ':''}line-detail-shiori" data-shiori-toggle="${esc(route.line)}" tabindex="-1">
      <svg viewBox="0 0 24 28" width="18" height="22" aria-hidden="true" data-shiori-glyph="1"><path d="M5 2h14v23l-7-5-7 5V2z" fill="${shiori?'currentColor':'none'}" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"></path></svg>
    </span>
    <button type="button" class="bookmark-toggle line-detail-bookmark ${bookmarked?'active':''}" data-bookmark-toggle="${esc(route.line)}" tabindex="-1">${bookmarked?'★':'☆'}</button>
  </div>`;
}
function stageNoteHtml(entry,variant){
  const englishId=`v2-stage-${variant}-${entry.id}`;
  return `<article class="stage-note stage-${variant}-note" data-stage-direction="${esc(entry.id)}" data-placement="${esc(entry.anchor?.type||'')}">
    <button class="stage-note-toggle" type="button" tabindex="-1" aria-expanded="false" aria-controls="${esc(englishId)}"><span class="stage-note-ja" lang="ja">${esc(entry.summaryJa)}</span></button>
    <p class="stage-note-en stage-original" id="${esc(englishId)}" lang="en" hidden>${esc(entry.text)}</p>
  </article>`;
}

export function buildVisualPreview(route,direction){
  const api=window.MTS_INDEX_ZERO,store=api?.store,state=api?.state;
  if(!store||!state)return null;
  const speech=store.getSpeech(route.scene,route.line);
  if(!speech)return null;
  const study=!!store.hasStudy?.(),structureReady=!!store.hasStructure?.(),stageReady=!!store.hasStageDirections?.();
  const translation=study?store.getTranslation(route.line):'',interpretation=study?store.getInterpretation(route.line):[];
  const grammar=study?store.getGrammar(route.line):[],vocab=study?store.getVocabulary(route.line):[];
  const structure=structureReady?store.getStructure(route.line):null;
  const entries=stageReady?[...(store.getStageDirectionsForSpeech(route.line)||[])].sort((a,b)=>a.sourceOrder-b.sourceOrder):[];
  const actorEntries=entries.filter(entry=>entry.actorCueForSpeech===true),remainder=entries.filter(entry=>entry.actorCueForSpeech!==true);
  const grammarHtml=study&&grammar.length?`<h3>Grammar / Usage</h3>${grammar.map(item=>`<div class="grammar-item"><b>${esc(item.pattern)}</b><p>${esc(item.description)}</p></div>`).join('')}`:'';
  const vocabHtml=study&&vocab.length?`<h3>Vocabulary</h3>${vocab.map(item=>`<button class="word-row" type="button" tabindex="-1"><b>${esc(item.surface)} · ${esc(item.meaning)}</b><span>${esc(item.lemma)}</span></button>`).join('')}`:'';
  const studyCard=grammarHtml||vocabHtml?`<div class="card study-notes">${grammarHtml}${vocabHtml}</div>`:'';
  const role=state.role?.(),mine=!!role&&speech.speaker===role,pdfPage=pageForLine(route.line);
  const actorHtml=actorEntries.length?`<section class="stage-actor-cues" data-stage-actor-cues="true">${actorEntries.map(entry=>stageNoteHtml(entry,'actor')).join('')}</section>`:'';
  const contextHtml=remainder.length?`<details class="card stage-context-details" data-stage-context-details="true"><summary class="stage-context-summary"><span>周辺の動き・状況</span><small>${remainder.length}</small></summary><div class="stage-context-body">${remainder.map(entry=>stageNoteHtml(entry,'context')).join('')}</div></details>`:'';
  const preview=document.createElement('div');
  preview.className='focus-page-preview line-nav-v2-preview';
  preview.dataset.direction=String(direction);
  preview.setAttribute('aria-hidden','true');
  preview.innerHTML=`<div class="card ${mine?'selected-role-line focus-role-line':''}" ${mine?'data-own-role="true"':''}>
      ${bookmarkHolderHtml(route,state)}
      <div class="speaker-title"><span>${esc(speech.speaker)}</span>${Number.isInteger(pdfPage)?`<span class="pdf-page-badge pdf-page-badge--detail" data-pdf-page="${pdfPage}" aria-label="PDF page ${pdfPage}">p.${pdfPage}</span>`:''}</div>
      <p class="line-detail-text">${annotatedText(speech.text,route.line,store)}</p><span class="chip">${esc(sceneLabel(route.scene))}</span>
    </div>
    ${actorHtml}
    <div class="card" data-translation-card><div class="eyebrow">Translation</div>${study?`<p class="translation">${esc(translation||'No translation available.')}</p>${interpretationHtml(interpretation)}`:'<p class="error-text">Translation and study notes could not be loaded.</p>'}</div>
    ${studyCard}
    <div class="card" data-structure-card>${structureReady?`<details class="structure-details"><summary class="structure-summary"><span>Structure</span><small>Clause hierarchy · S / V / O / C · connectors</small></summary>${renderStructure(speech,structure)}</details>`:'<p class="error-text">Structure could not be loaded.</p>'}</div>
    ${contextHtml}
    <div class="card"><div class="toolbar"><button class="primary-btn" type="button" tabindex="-1">Cue Practice</button><button class="ghost-btn" type="button" tabindex="-1">Rehearsal</button></div></div>`;
  preview.querySelectorAll('[tabindex]').forEach(node=>node.setAttribute('tabindex','-1'));
  return preview;
}

export const currentPage=()=>document.querySelector('.line-page');
export function prepareSurface(page=currentPage()){
  if(!page)return null;
  let layer=page.querySelector(':scope > .line-page-motion-layer');
  let surface=layer?.querySelector(':scope > .line-page-surface');
  if(surface)return{page,layer,surface,nav:page.querySelector(':scope > .floating-nav')};
  const nav=page.querySelector(':scope > .floating-nav');
  layer=document.createElement('div');layer.className='line-page-motion-layer';
  surface=document.createElement('div');surface.className='line-page-surface';
  for(const child of [...page.children])if(child!==nav)surface.append(child);
  layer.append(surface);
  if(nav)page.insertBefore(layer,nav);else page.append(layer);
  return{page,layer,surface,nav};
}
export function clearSurfaceMotion(surface){
  if(!surface)return;
  surface.classList.remove('is-focus-swiping','is-focus-settling','is-focus-entering');
  surface.style.transform='';surface.style.opacity='';surface.style.willChange='';
}
export function syncFocusRole(){
  const api=window.MTS_INDEX_ZERO,route=readRoute(),page=currentPage();
  if(!api?.store||!api?.state||!route||!page)return;
  const card=page.querySelector('.line-page-surface > .card')||page.querySelector(':scope > .card');
  const speech=api.store.getSpeech(route.scene,route.line),role=api.state.role?.();
  if(!card||!speech)return;
  const mine=!!role&&speech.speaker===role;
  card.classList.toggle('selected-role-line',mine);card.classList.toggle('focus-role-line',mine);
  if(mine)card.dataset.ownRole='true';else delete card.dataset.ownRole;
}
export function resetFocusScroll(){
  if(!readRoute())return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'})));
}
export function actualPageReady(target){
  const api=window.MTS_INDEX_ZERO,store=api?.store,state=api?.state,current=readRoute(),page=currentPage();
  if(!store||!state||!current||current.scene!==target.scene||current.line!==target.line||!page)return null;
  const speech=store.getSpeech(target.scene,target.line);
  if(!speech||page.querySelector('.line-detail-text')?.textContent?.trim()!==String(speech.text||'').trim())return null;
  const holder=page.querySelector('.line-bookmark-holder');
  if(!holder?.querySelector('[data-shiori-toggle]')||!holder.querySelector('[data-bookmark-toggle]'))return null;
  if(store.hasStudy?.()&&page.querySelector('[data-translation-card] .micro-status'))return null;
  if(store.hasStructure?.()&&!page.querySelector('[data-structure-card] .structure-details'))return null;
  if(store.hasStageDirections?.()){
    const entries=store.getStageDirectionsForSpeech(target.line)||[];
    if(entries.some(entry=>entry.actorCueForSpeech===true)&&!page.querySelector('[data-stage-actor-cues]'))return null;
    if(entries.some(entry=>entry.actorCueForSpeech!==true)&&!page.querySelector('[data-stage-context-details]'))return null;
  }
  const firstCard=page.querySelector('.line-page-surface > .card')||page.querySelector(':scope > .card');
  const role=state.role?.(),mine=!!role&&speech.speaker===role;
  if(mine&&firstCard?.dataset.ownRole!=='true')return null;
  return{page};
}
