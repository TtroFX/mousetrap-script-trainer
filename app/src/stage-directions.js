import {SCENES} from './config.js';

const app=document.getElementById('app');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const sceneLabel=id=>SCENES.find(scene=>scene.id===id)?.label||id;
const label=value=>String(value||'stage direction').replace(/-/g,' ').replace(/\b\w/g,char=>char.toUpperCase());
let api=null;
let stageData=null;
let observer=null;
let enhanceQueued=false;

const apiReady=new Promise(resolve=>{
  const probe=()=>{
    if(window.MTS_INDEX_ZERO?.store&&window.MTS_INDEX_ZERO?.state){api=window.MTS_INDEX_ZERO;resolve(api);return}
    requestAnimationFrame(probe);
  };
  probe();
});

const stageReady=apiReady.then(async current=>{
  if(!current.store.hasCore())await current.store.loadCore();
  stageData=await current.store.loadStageDirections();
  return stageData;
});

function route(){
  const raw=location.hash.replace(/^#/,'')||'/home';
  const [path,query='']=raw.split('?');
  return{path,q:new URLSearchParams(query)};
}

function itemHash(item){
  if(item?.kind==='speech')return`#/line?scene=${encodeURIComponent(item.sceneId)}&line=${encodeURIComponent(item.id)}`;
  const entry=item?.stage||api?.store?.getStageDirection?.(item?.id);
  if(!entry)return'#/script';
  if(entry.kind==='scene-setting')return`#/script?stage=${encodeURIComponent(entry.id)}`;
  return`#/line?scene=${encodeURIComponent(entry.sceneId)}&line=${encodeURIComponent(entry.speechId)}&stage=${encodeURIComponent(entry.id)}`;
}

function navigateItem(item){
  if(!item)return false;
  api.state.setScene(item.sceneId);
  location.hash=itemHash(item);
  return true;
}

function stageStudyHtml(entry){
  return `<details class="stage-study-details"><summary>Vocabulary / Notes</summary><div class="stage-study-body"><h3>Vocabulary</h3>${entry.vocabulary.map(item=>`<div class="stage-vocab-row"><b>${esc(item.surface)}</b><span>${esc(item.meaning)}</span><small>${esc(item.lemma)} · ${esc(item.note)}</small></div>`).join('')}<h3>Explanation</h3>${entry.notes.map(note=>`<p>${esc(note)}</p>`).join('')}<p class="stage-source">Source page ${entry.sourcePages.map(esc).join(', ')}</p></div></details>`;
}

function contextCardHtml(entry,{compact=false}={}){
  return `<article class="stage-direction-card${compact?' stage-direction-compact':''}" data-stage-direction="${esc(entry.id)}" data-placement="${esc(entry.anchor.type)}"><div class="stage-kicker"><span>Stage direction</span><span>${esc(label(entry.category))} · ${esc(label(entry.anchor.type))}</span></div><p class="stage-original">${esc(entry.text)}</p>${compact?'':`<p class="stage-ja">${esc(entry.summaryJa)}</p>${stageStudyHtml(entry)}`}</article>`;
}

function readerRow(entry){
  const article=document.createElement('article');
  article.className='line-row stage-reader-row';
  article.dataset.stageReader=entry.id;
  article.innerHTML=`<div class="stage-reader-head"><span>Stage direction</span><span>${esc(label(entry.category))}</span></div><p class="line-text stage-original">${esc(entry.text)}</p><p class="stage-row-ja">${esc(entry.summaryJa)}</p><button class="stage-context-link" type="button" data-stage-context="${esc(entry.id)}">Open context</button>`;
  article.querySelector('[data-stage-context]').addEventListener('click',()=>navigateItem({kind:'stage',sceneId:entry.sceneId,id:entry.id,stage:entry}));
  return article;
}

function enhanceScriptList(current){
  if(current.path!=='/script'||current.q.get('stage')||api.state.readerMode()!=='full')return;
  const sceneId=api.state.selectedScene(),list=app.querySelector('.reader-list');
  if(!list||list.dataset.stageEnhanced==='true')return;
  const speechNodes=new Map([...list.querySelectorAll('[data-line]')].map(node=>[node.dataset.line,node]));
  const sequence=api.store.getReaderSequence(sceneId);
  if(!sequence.length)return;
  const fragment=document.createDocumentFragment();
  for(const item of sequence){
    if(item.kind==='speech'){
      const node=speechNodes.get(item.id);
      if(node)fragment.append(node);
    }else fragment.append(readerRow(item.stage));
  }
  list.replaceChildren(fragment);
  list.dataset.stageEnhanced='true';
  const count=app.querySelector('.shell > section.card .muted');
  const stageCount=api.store.getStageDirectionsForScene(sceneId).length;
  if(count&&stageCount&&!count.dataset.stageCount){count.dataset.stageCount='true';count.append(` · ${stageCount} stage directions`)}
  const focus=current.q.get('line');
  if(focus)requestAnimationFrame(()=>document.getElementById(focus)?.scrollIntoView({block:'center'}));
}

function nearbyForSpeech(speechId){
  return api.store.getStageDirectionsForSpeech(speechId).sort((a,b)=>a.sourceOrder-b.sourceOrder);
}

function enhanceLineDetail(current){
  if(current.path!=='/line')return;
  const speechId=current.q.get('line'),page=app.querySelector('.line-page');
  if(!speechId||!page)return;
  const surface=page.querySelector('.line-page-surface')||page;
  const translation=surface.querySelector('[data-translation-card]');
  const entries=nearbyForSpeech(speechId);
  if(translation&&entries.length&&!surface.querySelector('[data-stage-direction-group]')){
    const section=document.createElement('section');
    section.className='stage-direction-group';section.dataset.stageDirectionGroup='true';
    section.innerHTML=`<div class="stage-group-heading">Stage directions near this line</div>${entries.map(entry=>contextCardHtml(entry)).join('')}`;
    translation.before(section);
  }
  const selected=current.q.get('stage');
  if(selected){
    const card=[...surface.querySelectorAll('[data-stage-direction]')].find(node=>node.dataset.stageDirection===selected);
    if(card&&!card.dataset.stageFocused){card.dataset.stageFocused='true';card.classList.add('stage-highlight');requestAnimationFrame(()=>card.scrollIntoView({block:'center'}))}
  }
}

function renderSceneSetting(current){
  if(current.path!=='/script'||!current.q.get('stage'))return false;
  const entry=api.store.getStageDirection(current.q.get('stage'));
  if(!entry||entry.kind!=='scene-setting')return false;
  api.state.setScene(entry.sceneId);
  const shell=app.querySelector('.shell');
  if(!shell||shell.querySelector(`[data-stage-page="${entry.id}"]`))return true;
  shell.querySelectorAll(':scope > section').forEach(node=>node.remove());
  const sequence=api.store.getReaderSequence(entry.sceneId),index=sequence.findIndex(item=>item.kind==='stage'&&item.id===entry.id),prev=sequence[index-1]||null,next=sequence[index+1]||null;
  const section=document.createElement('section');
  section.className='line-page stage-situation-page';section.dataset.stagePage=entry.id;
  section.innerHTML=`<div class="card stage-situation-card"><div class="stage-kicker"><span>Scene setting</span><span>${esc(sceneLabel(entry.sceneId))}</span></div><p class="stage-original stage-situation-text">${esc(entry.text)}</p><span class="chip">${esc(label(entry.category))}</span></div><div class="card stage-translation-card"><div class="eyebrow">Stage context</div><p class="stage-ja stage-situation-ja">${esc(entry.summaryJa)}</p></div><div class="card stage-learning-card">${stageStudyHtml(entry)}</div><div class="floating-nav stage-floating-nav"><button type="button" data-stage-prev ${prev?'':'disabled'} aria-label="Previous item">‹</button><button type="button" data-stage-close aria-label="Close stage context">×</button><button type="button" data-stage-next ${next?'':'disabled'} aria-label="Next item">›</button></div>`;
  shell.append(section);
  section.querySelector('[data-stage-prev]').onclick=()=>prev&&navigateItem(prev);
  section.querySelector('[data-stage-next]').onclick=()=>next&&navigateItem(next);
  section.querySelector('[data-stage-close]').onclick=()=>{api.state.setScene(entry.sceneId);location.hash=`#/script?line=${encodeURIComponent(entry.anchor.speechId)}`};
  requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));
  return true;
}

function practiceToggleHtml(active){
  return `<label class="practice-stage-toggle"><input type="checkbox" data-stage-visibility ${active?'checked':''}> Show stage directions</label>`;
}

function bindPracticeToggle(root){
  root.querySelectorAll('[data-stage-visibility]').forEach(input=>{
    if(input.dataset.bound)return;input.dataset.bound='true';
    input.addEventListener('change',()=>{api.state.setStageDirectionsVisible(input.checked);refreshPracticeDirections()});
  });
}

function refreshPracticeDirections(){
  app.querySelectorAll('[data-practice-stage]').forEach(node=>node.remove());
  app.querySelectorAll('[data-stage-visibility]').forEach(input=>{input.checked=api.state.stageDirectionsVisible()});
  if(!api.state.stageDirectionsVisible())return;
  for(const card of app.querySelectorAll('[data-practice-speech]')){
    const entries=nearbyForSpeech(card.dataset.practiceSpeech);
    if(!entries.length)continue;
    const block=document.createElement('div');
    block.className='practice-stage-directions';block.dataset.practiceStage='true';
    block.innerHTML=`<div class="stage-group-heading">Stage directions</div>${entries.map(entry=>contextCardHtml(entry,{compact:true})).join('')}`;
    const eyebrow=card.querySelector('.eyebrow');
    if(eyebrow)eyebrow.after(block);else card.prepend(block);
  }
}

function tagPracticeSpeechCards(current,practice){
  const progress=practice.querySelector('.practice-header div span')?.textContent||'';
  const index=Math.max(0,Number(progress.match(/(\d+)\s*\//)?.[1]||1)-1);
  const sceneId=SCENES.some(scene=>scene.id===current.q.get('scene'))?current.q.get('scene'):api.state.selectedScene();
  const rows=api.store.getScene(sceneId);
  if(current.path==='/cue'){
    const role=api.state.role(),cards=[];
    for(let i=1;i<rows.length;i+=1)if(rows[i].speaker===role)cards.push({cue:rows[i-1],target:rows[i]});
    const item=cards[index],nodes=practice.querySelectorAll('.practice-main > .practice-card');
    if(item&&nodes.length>=2){nodes[0].dataset.practiceSpeech=item.cue.id;nodes[1].dataset.practiceSpeech=item.target.id}
  }else if(current.path==='/rehearsal'){
    const item=rows[index],card=practice.querySelector('.practice-main .practice-card.stage-card');
    if(item&&card)card.dataset.practiceSpeech=item.id;
  }
}

function enhancePractice(current){
  if(!['/cue','/rehearsal'].includes(current.path))return;
  const practice=app.querySelector('.practice-full');
  if(!practice)return;
  const visible=api.state.stageDirectionsVisible();
  const setupCard=practice.querySelector('.practice-setup .card');
  if(setupCard&&!setupCard.querySelector('[data-stage-visibility]')){
    const start=setupCard.querySelector('[data-cue-start],[data-rehearsal-start]');
    start?.insertAdjacentHTML('beforebegin',practiceToggleHtml(visible));
  }else if(!setupCard&&!practice.querySelector('[data-stage-visibility]')){
    const track=practice.querySelector('.practice-track'),header=practice.querySelector('.practice-header');
    (track||header)?.insertAdjacentHTML('afterend',`<div class="practice-stage-toolbar">${practiceToggleHtml(visible)}</div>`);
  }
  bindPracticeToggle(practice);
  tagPracticeSpeechCards(current,practice);
  if(!practice.dataset.stageCardsEnhanced){practice.dataset.stageCardsEnhanced='true';refreshPracticeDirections()}
}

function stageSearchText(entry){
  return normalize([entry.text,entry.summaryJa,entry.category,...entry.vocabulary.flatMap(item=>[item.surface,item.lemma,item.meaning,item.note]),...entry.notes].join(' '));
}

function enhanceSearch(current){
  if(current.path!=='/search')return;
  const results=document.getElementById('search-results'),input=document.getElementById('search-input');
  if(!results||!input||results.querySelector('[data-stage-search-results]'))return;
  const term=normalize(input.value);if(!term)return;
  const hits=stageData.entries.filter(entry=>stageSearchText(entry).includes(term)).slice(0,60);if(!hits.length)return;
  const section=document.createElement('section');section.dataset.stageSearchResults='true';section.className='stage-search-results';
  section.innerHTML=`<div class="stage-search-heading">Stage directions · ${hits.length}</div>${hits.map(entry=>`<button class="search-result stage-search-result" type="button" data-stage-search-id="${esc(entry.id)}"><span><b>${esc(label(entry.category))}</b> · ${esc(sceneLabel(entry.sceneId))}</span><span class="search-line stage-original">${esc(entry.text)}</span><span class="search-translation">${esc(entry.summaryJa)}</span></button>`).join('')}`;
  results.append(section);
  section.querySelectorAll('[data-stage-search-id]').forEach(button=>button.onclick=()=>{const entry=api.store.getStageDirection(button.dataset.stageSearchId);if(entry)navigateItem({kind:'stage',sceneId:entry.sceneId,id:entry.id,stage:entry})});
}

function enhance(){
  if(!stageData||!api)return;
  const current=route();
  if(renderSceneSetting(current))return;
  enhanceScriptList(current);
  enhanceLineDetail(current);
  enhancePractice(current);
  enhanceSearch(current);
}

function scheduleEnhance(){
  if(enhanceQueued)return;
  enhanceQueued=true;
  requestAnimationFrame(()=>{enhanceQueued=false;enhance()});
}

stageReady.then(()=>{
  observer=new MutationObserver(scheduleEnhance);
  observer.observe(app,{childList:true,subtree:true});
  scheduleEnhance();
}).catch(error=>console.error('[MTS] stage directions unavailable',error));
window.addEventListener('hashchange',scheduleEnhance);

window.MTS_STAGE=Object.freeze({
  ready:stageReady,
  get data(){return stageData},
  getStage:id=>api?.store?.getStageDirection(id)||null,
  getAttached:speechId=>api?.store?.getStageDirectionsForSpeech(speechId)||[],
  getReaderSequence:sceneId=>api?.store?.getReaderSequence(sceneId)||[],
  diagnostics:()=>({
    loaded:!!stageData,
    total:stageData?.entries?.length||0,
    standalone:stageData?.counts?.standalone||0,
    attached:stageData?.counts?.attached||0,
    dialogueSpeeches:api?.store?.speechById?.size||0,
    visibleInPractice:api?.state?.stageDirectionsVisible?.()??true,
  }),
});
