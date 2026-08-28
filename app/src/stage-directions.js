import { DATA_PATHS, SCENES } from './config.js';

const app=document.getElementById('app');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const sceneLabel=id=>SCENES.find(scene=>scene.id===id)?.label||id;
const placementLabel=placement=>({before:'Before the line',delivery:'During / delivery',after:'After the line'}[placement]||'Stage direction');
let api=null;
let stageData=null;
let standaloneByScene=new Map();
let attachedBySpeech=new Map();
let stageById=new Map();
let observer=null;
let enhanceQueued=false;
let swipe=null;

const apiReady=new Promise(resolve=>{
  const probe=()=>{
    if(window.MTS_INDEX_ZERO?.store&&window.MTS_INDEX_ZERO?.state){api=window.MTS_INDEX_ZERO;resolve(api);return}
    requestAnimationFrame(probe);
  };
  probe();
});

function validateStage(data){
  if(data?.schemaVersion!==1||!Array.isArray(data.entries))throw new Error('STAGE_SCHEMA_INVALID');
  if(data.counts?.standalone!==5||data.counts?.attached!==772||data.counts?.total!==777||data.entries.length!==777)throw new Error('STAGE_COUNT_INVALID');
  const ids=new Set(),standalone=new Map(),attached=new Map(),byId=new Map();
  for(const entry of data.entries){
    if(!entry?.id||ids.has(entry.id)||!entry.sceneId||!String(entry.text||'').trim()||!String(entry.summaryJa||'').trim())throw new Error(`STAGE_ENTRY_INVALID:${entry?.id||'unknown'}`);
    if(!Array.isArray(entry.vocabulary)||!entry.vocabulary.length||!Array.isArray(entry.notes)||!entry.notes.length)throw new Error(`STAGE_STUDY_INVALID:${entry.id}`);
    ids.add(entry.id);byId.set(entry.id,entry);
    if(entry.kind==='scene-setting'){
      if(!entry.anchor?.speechId||!['before','after'].includes(entry.anchor.type))throw new Error(`STAGE_ANCHOR_INVALID:${entry.id}`);
      if(!standalone.has(entry.sceneId))standalone.set(entry.sceneId,[]);
      standalone.get(entry.sceneId).push(entry);
    }else if(entry.kind==='stage-direction'){
      if(!entry.speechId||!['before','delivery','after'].includes(entry.placement))throw new Error(`STAGE_ATTACHMENT_INVALID:${entry.id}`);
      if(!attached.has(entry.speechId))attached.set(entry.speechId,[]);
      attached.get(entry.speechId).push(entry);
    }else throw new Error(`STAGE_KIND_INVALID:${entry.id}`);
  }
  for(const rows of standalone.values())rows.sort((a,b)=>(a.anchor.order??0)-(b.anchor.order??0)||a.id.localeCompare(b.id));
  stageById=byId;standaloneByScene=standalone;attachedBySpeech=attached;
  return data;
}

async function validateReferences(){
  await apiReady;
  for(const [sceneId,rows] of standaloneByScene){
    for(const entry of rows){
      if(!api.store.getSpeech(sceneId,entry.anchor.speechId))throw new Error(`STAGE_ANCHOR_MISSING:${entry.id}`);
    }
  }
  for(const [speechId,rows] of attachedBySpeech){
    for(const entry of rows){
      if(!api.store.getSpeech(entry.sceneId,speechId))throw new Error(`STAGE_SPEECH_MISSING:${entry.id}`);
    }
  }
}

const stageReady=fetch(DATA_PATHS.stageDirections,{cache:'no-store'})
  .then(response=>{if(!response.ok)throw new Error(`STAGE_HTTP_${response.status}`);return response.json()})
  .then(validateStage)
  .then(async data=>{stageData=data;await validateReferences();return data});

function readerSequence(sceneId){
  if(!api?.store||!stageData)return[];
  const speeches=api.store.getScene(sceneId);
  const settings=standaloneByScene.get(sceneId)||[];
  const before=new Map(),after=new Map();
  for(const entry of settings){
    const map=entry.anchor.type==='after'?after:before;
    if(!map.has(entry.anchor.speechId))map.set(entry.anchor.speechId,[]);
    map.get(entry.anchor.speechId).push(entry);
  }
  const sequence=[];
  for(const speech of speeches){
    for(const entry of before.get(speech.id)||[])sequence.push({kind:'stage',sceneId,id:entry.id,entry});
    sequence.push({kind:'speech',sceneId,id:speech.id,speech});
    for(const entry of after.get(speech.id)||[])sequence.push({kind:'stage',sceneId,id:entry.id,entry});
  }
  return sequence;
}

function currentRoute(){
  const raw=location.hash.replace(/^#/,'')||'/home';
  const [path,query='']=raw.split('?'),q=new URLSearchParams(query);
  if(path==='/line'&&q.get('scene')&&q.get('line'))return{kind:'speech',sceneId:q.get('scene'),id:q.get('line')};
  if(path==='/script'&&q.get('stage')){
    const entry=stageById.get(q.get('stage'));
    if(entry?.kind==='scene-setting')return{kind:'stage',sceneId:entry.sceneId,id:entry.id};
  }
  return null;
}

function targetFrom(route,direction){
  if(!route)return null;
  const sequence=readerSequence(route.sceneId),index=sequence.findIndex(item=>item.kind===route.kind&&item.id===route.id);
  return index<0?null:sequence[index+(direction>0?1:-1)]||null;
}

function itemHash(item){
  if(!item)return'';
  return item.kind==='stage'
    ?`#/script?stage=${encodeURIComponent(item.id)}`
    :`#/line?scene=${encodeURIComponent(item.sceneId)}&line=${encodeURIComponent(item.id)}`;
}

function navigateItem(item){
  if(!item)return false;
  api?.state?.setScene?.(item.sceneId);
  location.hash=itemHash(item);
  return true;
}

function vocabHtml(entry){
  return `<details class="stage-study-details"><summary>Vocabulary / Notes</summary><div class="stage-study-body"><h3>Vocabulary</h3>${entry.vocabulary.map(item=>`<div class="stage-vocab-row"><b>${esc(item.surface)}</b><span>${esc(item.meaning)}</span><small>${esc(item.lemma)} · ${esc(item.note)}</small></div>`).join('')}<h3>Explanation</h3>${entry.notes.map(note=>`<p>${esc(note)}</p>`).join('')}<p class="stage-source">PDF p.${entry.sourcePages.map(esc).join(', ')}</p></div></details>`;
}

function attachedHtml(entry){
  return `<article class="stage-direction-card" data-stage-direction="${esc(entry.id)}" data-placement="${esc(entry.placement)}"><div class="stage-kicker">Stage direction · ${esc(placementLabel(entry.placement))}</div><p class="stage-original">${esc(entry.text)}</p><p class="stage-ja">${esc(entry.summaryJa)}</p>${vocabHtml(entry)}</article>`;
}

function enhanceLinePage(route){
  const page=app.querySelector('.line-page');
  if(!page)return;
  const translation=page.querySelector('[data-translation-card]');
  if(translation&&!page.querySelector('[data-stage-direction-group]')){
    const attached=attachedBySpeech.get(route.id)||[];
    if(attached.length)translation.insertAdjacentHTML('beforebegin',`<section class="stage-direction-group" data-stage-direction-group>${attached.map(attachedHtml).join('')}</section>`);
  }
  const prev=targetFrom(route,-1),next=targetFrom(route,1),prevButton=page.querySelector('[data-prev]'),nextButton=page.querySelector('[data-next]');
  if(prevButton){prevButton.disabled=!prev;prevButton.onclick=()=>prev&&navigateItem(prev)}
  if(nextButton){nextButton.disabled=!next;nextButton.onclick=()=>next&&navigateItem(next)}
  page.dataset.mixedReader='true';
}

function stageRow(entry){
  return `<button class="line-row stage-reader-row" type="button" data-stage-open="${esc(entry.id)}"><span class="speaker">SITUATION<small>STAGE</small></span><span class="line-text stage-original">${esc(entry.text)}</span><span class="stage-row-ja">${esc(entry.summaryJa)}</span></button>`;
}

function enhanceScriptList(){
  const raw=location.hash.replace(/^#/,'')||'/home',[path,query='']=raw.split('?'),q=new URLSearchParams(query);
  if(path!=='/script'||q.get('stage'))return;
  if(api?.state?.readerMode?.()!=='full')return;
  const sceneId=api.state.selectedScene(),list=app.querySelector('.reader-list');
  if(!list||list.dataset.stageEnhanced==='true')return;
  const settings=standaloneByScene.get(sceneId)||[];
  const afterCursor=new Map();
  for(const entry of settings){
    const anchor=list.querySelector(`[data-line="${CSS.escape(entry.anchor.speechId)}"]`);
    if(!anchor)continue;
    const holder=document.createElement('div');holder.innerHTML=stageRow(entry);const row=holder.firstElementChild;
    if(entry.anchor.type==='before')anchor.before(row);
    else{const cursor=afterCursor.get(entry.anchor.speechId)||anchor;cursor.after(row);afterCursor.set(entry.anchor.speechId,row)}
  }
  list.dataset.stageEnhanced='true';
  list.querySelectorAll('[data-stage-open]').forEach(button=>button.addEventListener('click',()=>navigateItem({kind:'stage',sceneId,id:button.dataset.stageOpen})));
  const count=app.querySelector('.shell > section.card .muted');
  if(count&&settings.length)count.insertAdjacentHTML('beforeend',` · ${settings.length} situation page${settings.length===1?'':'s'}`);
}

function renderStandaloneStage(route){
  const entry=stageById.get(route.id),shell=app.querySelector('.shell');
  if(!entry||!shell)return;
  if(shell.querySelector(`[data-stage-page="${CSS.escape(entry.id)}"]`))return;
  shell.querySelectorAll(':scope > section').forEach(node=>node.remove());
  const prev=targetFrom(route,-1),next=targetFrom(route,1);
  shell.insertAdjacentHTML('beforeend',`<section class="line-page stage-situation-page" data-stage-page="${esc(entry.id)}" data-mixed-reader="true"><div class="card stage-situation-card"><div class="stage-kicker">SITUATION</div><p class="stage-original stage-situation-text">${esc(entry.text)}</p><span class="chip">${esc(sceneLabel(entry.sceneId))}</span></div><div class="card stage-translation-card"><div class="eyebrow">状況説明</div><p class="stage-ja stage-situation-ja">${esc(entry.summaryJa)}</p></div><div class="card stage-learning-card">${vocabHtml(entry)}</div><div class="floating-nav"><button data-stage-prev ${prev?'':'disabled'}>‹</button><button data-stage-close>×</button><button data-stage-next ${next?'':'disabled'}>›</button></div></section>`);
  const page=shell.querySelector('[data-stage-page]');
  page.querySelector('[data-stage-prev]').onclick=()=>prev&&navigateItem(prev);
  page.querySelector('[data-stage-next]').onclick=()=>next&&navigateItem(next);
  page.querySelector('[data-stage-close]').onclick=()=>location.hash=`#/script?line=${encodeURIComponent(entry.anchor.speechId)}`;
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'})));
}

function stageSearchText(entry){
  return normalize([entry.text,entry.summaryJa,...entry.vocabulary.flatMap(item=>[item.surface,item.lemma,item.meaning,item.note]),...entry.notes].join(' '));
}

function enhanceSearch(){
  const results=document.getElementById('search-results'),input=document.getElementById('search-input');
  if(!results||!input)return;
  const term=normalize(input.value);
  results.querySelector('[data-stage-search]')?.remove();
  if(!term)return;
  const hits=stageData.entries.filter(entry=>stageSearchText(entry).includes(term)).slice(0,60);
  if(!hits.length)return;
  const section=document.createElement('section');section.dataset.stageSearch='true';section.className='stage-search-results';
  section.innerHTML=`<div class="stage-search-heading">Stage directions / Situations · ${hits.length}</div>${hits.map(entry=>`<button class="search-result stage-search-result" type="button" data-stage-search-id="${esc(entry.id)}"><span><b>${entry.kind==='scene-setting'?'SITUATION':'STAGE DIRECTION'}</b> · ${esc(sceneLabel(entry.sceneId))}</span><span class="search-line stage-original">${esc(entry.text)}</span><span class="search-translation">${esc(entry.summaryJa)}</span></button>`).join('')}`;
  results.append(section);
  section.querySelectorAll('[data-stage-search-id]').forEach(button=>button.onclick=()=>{
    const entry=stageById.get(button.dataset.stageSearchId);
    if(!entry)return;
    if(entry.kind==='scene-setting')navigateItem({kind:'stage',sceneId:entry.sceneId,id:entry.id});
    else navigateItem({kind:'speech',sceneId:entry.sceneId,id:entry.speechId});
  });
}

function enhance(){
  if(!stageData||!api)return;
  const route=currentRoute();
  if(route?.kind==='speech')enhanceLinePage(route);
  else if(route?.kind==='stage')renderStandaloneStage(route);
  else enhanceScriptList();
  enhanceSearch();
}

function scheduleEnhance(){
  if(enhanceQueued)return;
  enhanceQueued=true;
  requestAnimationFrame(()=>{enhanceQueued=false;enhance()});
}

function interactive(target){return!!target.closest?.('button,a,input,select,textarea,summary,details,[contenteditable="true"],[data-no-page-swipe]')}
function beginSwipe(event){
  if(event.pointerType==='mouse'||!stageData||!currentRoute()||!event.target.closest?.('.line-page')||interactive(event.target))return;
  swipe={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,startTime:event.timeStamp||performance.now(),page:event.target.closest('.line-page'),axis:null};
  event.stopPropagation();
}
function moveSwipe(event){
  if(!swipe||event.pointerId!==swipe.pointerId)return;
  event.stopPropagation();
  const dx=event.clientX-swipe.startX,dy=event.clientY-swipe.startY,ax=Math.abs(dx),ay=Math.abs(dy);
  if(!swipe.axis&&Math.max(ax,ay)>=10)swipe.axis=ax>ay*1.08?'x':ay>ax*1.08?'y':null;
  if(swipe.axis!=='x')return;
  event.preventDefault();
  const available=!!targetFrom(currentRoute(),dx<0?1:-1),shown=available?dx:dx*.28;
  swipe.page?.classList.add('is-focus-swiping');
  swipe.page?.style.setProperty('--focus-swipe-x',`${shown}px`);
  swipe.page?.style.setProperty('--focus-swipe-opacity',String(Math.max(.9,1-Math.min(Math.abs(shown)/1200,.1))));
}
function finishSwipe(event){
  if(!swipe||event.pointerId!==swipe.pointerId)return;
  event.stopPropagation();
  const state=swipe;swipe=null;
  const dx=event.clientX-state.startX,dy=event.clientY-state.startY,ax=Math.abs(dx),ay=Math.abs(dy),duration=Math.max(1,(event.timeStamp||performance.now())-state.startTime),width=Math.max(320,state.page?.clientWidth||innerWidth||320),threshold=Math.min(88,Math.max(46,width*.14)),velocity=ax/duration;
  state.page?.classList.remove('is-focus-swiping');state.page?.style.removeProperty('--focus-swipe-x');state.page?.style.removeProperty('--focus-swipe-opacity');
  if(ax>ay*1.05&&(ax>=threshold||(ax>=30&&velocity>=.48))){const target=targetFrom(currentRoute(),dx<0?1:-1);if(target)navigateItem(target)}
}
function cancelSwipe(event){if(!swipe||event.pointerId!==swipe.pointerId)return;swipe.page?.classList.remove('is-focus-swiping');swipe.page?.style.removeProperty('--focus-swipe-x');swipe.page?.style.removeProperty('--focus-swipe-opacity');swipe=null}

window.addEventListener('pointerdown',beginSwipe,{capture:true,passive:true});
window.addEventListener('pointermove',moveSwipe,{capture:true,passive:false});
window.addEventListener('pointerup',finishSwipe,{capture:true,passive:true});
window.addEventListener('pointercancel',cancelSwipe,{capture:true,passive:true});
window.addEventListener('hashchange',()=>{swipe=null;scheduleEnhance();requestAnimationFrame(()=>requestAnimationFrame(()=>{if(currentRoute())window.scrollTo({top:0,left:0,behavior:'auto'})}))});

const ready=Promise.all([apiReady,stageReady]).then(()=>{
  observer=new MutationObserver(scheduleEnhance);observer.observe(app,{childList:true,subtree:true});
  scheduleEnhance();
  return stageData;
});

window.MTS_STAGE=Object.freeze({
  ready,
  get data(){return stageData},
  getStage:id=>stageById.get(id)||null,
  getAttached:speechId=>[...(attachedBySpeech.get(speechId)||[])],
  getReaderSequence:sceneId=>readerSequence(sceneId),
  diagnostics:()=>({loaded:!!stageData,total:stageData?.entries?.length||0,standalone:[...standaloneByScene.values()].reduce((n,rows)=>n+rows.length,0),attached:[...attachedBySpeech.values()].reduce((n,rows)=>n+rows.length,0),route:currentRoute()})
});

ready.catch(error=>console.error('[MTS] stage directions unavailable',error));
