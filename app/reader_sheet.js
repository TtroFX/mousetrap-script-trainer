// Shared study interaction layer, r10: Script/Search/Cue/Rehearsal vocabulary + line explanation.
(()=>{'use strict';

const app=document.getElementById('app');
const wordOverlay=document.getElementById('wordOverlay');
const wordSheet=document.getElementById('wordSheet');
const wordHandle=document.getElementById('wordSheetHandle');
const wordClose=document.getElementById('wordSheetClose');
const wordContent=document.getElementById('wordSheetContent');
const learningOverlay=document.getElementById('learningOverlay');
const learningFrame=document.getElementById('learningFrame');
const cueFrame=document.getElementById('cueFrame');
const rehearsalFrame=document.getElementById('rehearsalFrame');
if(!app||!wordOverlay||!wordSheet||!wordHandle||!wordClose||!wordContent||!learningOverlay||!learningFrame)return;

const KEY={
  selectedScene:'mts.selectedSceneId',
  character:'mts.characterId',
  lineCurrent:'mts.lineDetail.current',
  cueState:'mts.practice.cue.state',
  rehearsalState:'mts.practice.rehearsal.state'
};
let restoreFocus=null,closeTimer=0,drag=null,enhanceQueued=false,explanationRestoreFocus=null;
const boundDocs=new WeakSet();

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))}
function parse(raw,f=null){try{return raw?JSON.parse(raw):f}catch{return f}}
function scriptData(){return window.MTS_SHARED_SCRIPT_DATA||null}
function annotations(){return window.MTS_SHARED_LINE_ANNOTATIONS||null}
function dictionary(){return window.MTS_SHARED_WORD_DICTIONARY||null}
function speech(scene,id){return scriptData()?.[scene]?.speeches?.find(x=>x.id===id)||null}
function annotation(id){return annotations()?.[id]||null}
function norm(v){return String(v||'').trim().toLowerCase()}
function dictEntry(lemma){const d=dictionary();if(!d||!lemma)return null;return d[lemma]||d[Object.keys(d).find(k=>norm(k)===norm(lemma))]||null}
function vocabEntry(lineId,lemma,surface){
  const list=annotation(lineId)?.vocabulary;
  return Array.isArray(list)
    ? list.find(v=>norm(v.lemma)===norm(lemma)&&(!surface||norm(v.surface)===norm(surface)))
      ||list.find(v=>norm(v.lemma)===norm(lemma))||null
    : null;
}
function isWordChar(c){return !!c&&/[A-Za-z0-9'’\-]/.test(c)}
function candidateBoundary(text,start,end,surface){
  if(!surface)return false;
  const first=surface[0],last=surface[surface.length-1];
  if(isWordChar(first)&&isWordChar(text[start-1]))return false;
  if(isWordChar(last)&&isWordChar(text[end]))return false;
  return true;
}
function selectedScene(){return localStorage.getItem(KEY.selectedScene)||'act1-scene1'}
function selectedCharacter(){return localStorage.getItem(KEY.character)||''}
function previousSpeech(scene,id){
  const rows=scriptData()?.[scene]?.speeches||[],i=rows.findIndex(x=>x.id===id);
  return i>0?rows[i-1]:null;
}

function injectStyle(){
  if(document.getElementById('mts-reader-v2-style'))return;
  const style=document.createElement('style');
  style.id='mts-reader-v2-style';
  style.textContent=`
body.word-sheet-open{overflow:hidden}
#learningOverlay.study-over-practice{z-index:75!important}
.line-row .line-text{line-height:1.72}
.reader-vocab{display:inline;border-radius:.28em;padding:.02em .08em;margin:0 -.01em;background:linear-gradient(to top,rgba(232,190,97,.34) 0 46%,transparent 46% 100%);text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:3px;text-decoration-color:rgba(139,94,60,.72);cursor:pointer;-webkit-box-decoration-break:clone;box-decoration-break:clone;transition:background .12s ease}
.reader-vocab:hover{background:rgba(232,190,97,.30)}
.reader-vocab:active{background:rgba(232,190,97,.52)}
.word-sheet-backdrop{position:fixed;inset:0;z-index:85;display:flex;align-items:flex-end;justify-content:center;background:rgba(25,21,18,.35);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);animation:mtsWordBackdropIn .18s ease both}
.word-sheet-backdrop[hidden]{display:none!important}
.word-sheet{--word-drag:0px;position:relative;width:min(760px,100%);max-height:min(74dvh,720px);min-height:320px;background:#f7f5f0;border-radius:24px 24px 0 0;box-shadow:0 -18px 52px rgba(30,24,19,.24);overflow:hidden;transform:translateY(var(--word-drag));animation:mtsWordRise .22s cubic-bezier(.2,.82,.2,1) both;transition:transform .18s cubic-bezier(.2,.82,.2,1)}
.word-sheet.dragging{transition:none;animation:none}
.word-sheet-backdrop.closing{animation:mtsWordBackdropOut .18s ease both}
.word-sheet-backdrop.closing .word-sheet{animation:none;transform:translateY(105%)}
.word-sheet-handle{position:absolute;inset:0 0 auto 0;height:52px;z-index:3;display:flex;align-items:flex-start;justify-content:center;padding-top:9px;touch-action:none;background:linear-gradient(to bottom,rgba(247,245,240,.98),rgba(247,245,240,.78),transparent)}
.word-sheet-grabber{width:42px;height:5px;border-radius:999px;background:rgba(38,35,31,.26)}
.word-sheet-close{position:absolute;right:12px;top:8px;width:36px;height:36px;border:0;border-radius:999px;background:rgba(255,255,255,.88);color:#26231f;font-size:24px;line-height:1;box-shadow:0 4px 16px rgba(31,25,20,.10);cursor:pointer}
.word-sheet-content{max-height:min(74dvh,720px);overflow:auto;-webkit-overflow-scrolling:touch;padding:46px 16px calc(22px + env(safe-area-inset-bottom))}
.word-sheet-head{padding:12px 2px 4px}.word-sheet-head h2{font-size:30px;line-height:1.15;margin:.15em 0}.word-lemma{color:#736d65;font-size:14px}.word-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.word-meta span{display:inline-block;padding:5px 8px;border-radius:999px;background:#eee6dc;color:#5f574f;font-size:11px;font-weight:750}
.word-context-card,.word-dict-card{background:#fff;border:1px solid #ded8cf;border-radius:18px;padding:15px;margin-top:12px;box-shadow:0 8px 24px rgba(45,36,29,.07)}
.word-context-card .label,.word-dict-card .label{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8b5e3c;font-weight:900;margin-bottom:7px}.word-context-sentence{font-size:17px;line-height:1.65;font-weight:700;margin:0}.word-context-translation{font-size:15px;line-height:1.65;color:#5f574f;margin:9px 0 0;padding-top:9px;border-top:1px solid #eee8df}
.word-dict-grid{display:grid;grid-template-columns:max-content 1fr;gap:8px 12px;margin:0}.word-dict-grid dt{font-weight:800;color:#736d65}.word-dict-grid dd{margin:0;line-height:1.55}.word-sheet-empty{color:#a13d35;font-weight:800}
@keyframes mtsWordRise{from{transform:translateY(105%)}to{transform:translateY(0)}}
@keyframes mtsWordBackdropIn{from{background:rgba(25,21,18,0)}to{background:rgba(25,21,18,.35)}}
@keyframes mtsWordBackdropOut{from{background:rgba(25,21,18,.35)}to{background:rgba(25,21,18,0)}}
@media(max-width:600px){.word-sheet{max-height:78dvh;border-radius:22px 22px 0 0}.word-sheet-content{max-height:78dvh;padding-inline:13px}.word-sheet-head h2{font-size:27px}}
@media(prefers-reduced-motion:reduce){.word-sheet,.word-sheet-backdrop{animation:none!important;transition:none!important}}
`;
  document.head.appendChild(style);
}

function injectFrameStyle(doc){
  if(doc.getElementById('mts-study-anywhere-style'))return;
  const style=doc.createElement('style');
  style.id='mts-study-anywhere-style';
  style.textContent=`
.reader-vocab{display:inline;border-radius:.25em;padding:.01em .08em;margin:0 -.01em;background:linear-gradient(to top,rgba(212,160,23,.42) 0 48%,transparent 48% 100%);text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:3px;text-decoration-color:rgba(255,218,111,.9);cursor:pointer;-webkit-box-decoration-break:clone;box-decoration-break:clone}
[data-study-line]{cursor:pointer}
.reader-vocab:active{background:rgba(212,160,23,.46)}
`;
  doc.head.appendChild(style);
}

function makeRanges(text,vocab){
  const candidates=[],lower=text.toLowerCase();
  for(const v of vocab){
    const surface=String(v?.surface||'').trim();
    if(!surface)continue;
    const needle=surface.toLowerCase();
    let from=0;
    while(from<=lower.length-needle.length){
      const start=lower.indexOf(needle,from);
      if(start<0)break;
      const end=start+needle.length;
      if(candidateBoundary(text,start,end,surface))candidates.push({start,end,v});
      from=start+Math.max(1,needle.length);
    }
  }
  candidates.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start));
  const selected=[];let end=0;
  for(const c of candidates){if(c.start<end)continue;selected.push(c);end=c.end}
  return selected;
}
function clearStudyBinding(el){delete el.dataset.studyScene;delete el.dataset.studyLine;delete el.dataset.studyFingerprint}
function enhanceTextElement(el,scene,line){
  if(!el)return false;
  const x=speech(scene,line),a=annotation(line);
  if(!x||!a)return false;
  const text=String(x.text||''),fingerprint=`${scene}|${line}|${text}`;
  if(el.textContent!==text){clearStudyBinding(el);return false}
  if(el.dataset.studyFingerprint===fingerprint&&el.querySelector('.reader-vocab'))return true;
  const vocab=Array.isArray(a.vocabulary)?a.vocabulary:[],ranges=makeRanges(text,vocab),fragment=el.ownerDocument.createDocumentFragment();
  let cursor=0;
  for(const r of ranges){
    if(r.start>cursor)fragment.append(el.ownerDocument.createTextNode(text.slice(cursor,r.start)));
    const span=el.ownerDocument.createElement('span');
    span.className='reader-vocab';
    span.dataset.scene=scene;span.dataset.line=line;span.dataset.lemma=String(r.v.lemma||'');span.dataset.surface=String(r.v.surface||text.slice(r.start,r.end));
    span.textContent=text.slice(r.start,r.end);span.title='辞書を開く';fragment.append(span);cursor=r.end;
  }
  if(cursor<text.length)fragment.append(el.ownerDocument.createTextNode(text.slice(cursor)));
  el.replaceChildren(fragment);el.dataset.studyScene=scene;el.dataset.studyLine=line;el.dataset.studyFingerprint=fingerprint;return true;
}

function enhanceMain(){
  enhanceQueued=false;if(!scriptData()||!annotations())return;
  if(location.hash.startsWith('#/script')){
    const scene=selectedScene();app.querySelectorAll('.line-row[data-line]').forEach(row=>enhanceTextElement(row.querySelector('.line-text'),scene,row.dataset.line));
  }
  if(location.hash.startsWith('#/search')){
    app.querySelectorAll('.search-result[data-search-line][data-search-scene]').forEach(row=>enhanceTextElement(row.querySelector('.search-line'),row.dataset.searchScene,row.dataset.searchLine));
  }
}
function queueEnhance(){
  if(enhanceQueued)return;enhanceQueued=true;
  requestAnimationFrame(()=>{enhanceMain();enhancePracticeFrame(cueFrame,'cue');enhancePracticeFrame(rehearsalFrame,'rehearsal')});
}

function setCurrent(scene,line){
  if(!speech(scene,line))return false;
  localStorage.setItem(KEY.selectedScene,scene);localStorage.setItem(KEY.lineCurrent,JSON.stringify({sceneId:scene,lineId:line}));return true;
}
function renderWord(scene,line,lemma,surface){
  const x=speech(scene,line),a=annotation(line),v=vocabEntry(line,lemma,surface),d=dictEntry(lemma);
  if(!x||!a){wordContent.innerHTML='<p class="word-sheet-empty">この単語の文脈情報を読み込めません。</p>';return}
  const translation=String(a.translation||''),display=surface||v?.surface||d?.lemma||lemma||'Word',dl=[];
  const add=(k,val)=>{if(String(val||'').trim())dl.push(`<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`)};
  add('日本語',d?.contextMeaning||v?.meaning||d?.coreMeaning);add('Core',d?.coreMeaning);add('In this play',d?.contextExplanation);add('Forms',d?.forms);
  if(d?.pattern)add('Pattern',`${d.pattern}${d.patternDesc?` — ${d.patternDesc}`:''}`);
  wordContent.innerHTML=`<header class="word-sheet-head"><div class="eyebrow">Dictionary</div><h2>${esc(display)}</h2><div class="word-lemma">${esc(d?.lemma||lemma||'')}</div><div class="word-meta">${d?.pos?`<span>${esc(d.pos)}</span>`:''}${d?.ipa?`<span>${esc(d.ipa)}</span>`:''}</div></header><section class="word-context-card"><div class="label">In this line</div><p class="word-context-sentence">${esc(x.text)}</p><p class="word-context-translation">${esc(translation||'日本語訳はありません。')}</p></section><section class="word-dict-card"><div class="label">Word dictionary</div>${dl.length?`<dl class="word-dict-grid">${dl.join('')}</dl>`:'<p class="word-sheet-empty">辞書情報が見つかりません。</p>'}</section>`;
}
function openWord(scene,line,lemma,surface,source=null){
  if(!setCurrent(scene,line))return;clearTimeout(closeTimer);restoreFocus=source||document.activeElement;
  wordOverlay.classList.remove('closing');wordSheet.classList.remove('dragging');wordSheet.style.setProperty('--word-drag','0px');
  renderWord(scene,line,lemma,surface);wordOverlay.hidden=false;document.body.classList.add('word-sheet-open');wordContent.scrollTop=0;
}
function finishCloseWord(){
  wordOverlay.hidden=true;wordOverlay.classList.remove('closing');wordSheet.classList.remove('dragging');wordSheet.style.setProperty('--word-drag','0px');
  document.body.classList.remove('word-sheet-open');const target=restoreFocus;restoreFocus=null;if(target?.isConnected)target.focus({preventScroll:true});
}
function closeWord(animate=true){
  clearTimeout(closeTimer);if(wordOverlay.hidden){finishCloseWord();return}if(!animate){finishCloseWord();return}
  wordOverlay.classList.add('closing');document.body.classList.remove('word-sheet-open');closeTimer=setTimeout(finishCloseWord,190);
}

function sendExplanation(scene,line){
  if(!setCurrent(scene,line))return;
  const api=learningFrame.contentWindow?.MTS_LEARNING;if(api?.showLine)api.showLine(scene,line);else learningFrame.contentWindow?.postMessage({type:'mts:line',sceneId:scene,lineId:line},'*');
}
function openExplanationOverPractice(scene,line,source=null){
  if(!setCurrent(scene,line))return;explanationRestoreFocus=source||null;learningOverlay.classList.add('study-over-practice');learningOverlay.hidden=false;requestAnimationFrame(()=>sendExplanation(scene,line));
}
function closeExplanationOverPractice(){
  if(!learningOverlay.classList.contains('study-over-practice'))return false;
  learningOverlay.hidden=true;learningOverlay.classList.remove('study-over-practice');
  const target=explanationRestoreFocus;explanationRestoreFocus=null;if(target?.isConnected)target.focus({preventScroll:true});return true;
}
function bindLearningFrame(){
  let doc;try{doc=learningFrame.contentDocument}catch{return}
  if(!doc||boundDocs.has(doc))return;boundDocs.add(doc);
  doc.addEventListener('click',event=>{
    if(!learningOverlay.classList.contains('study-over-practice'))return;
    const close=event.target instanceof Element?event.target.closest('#close,#closeFail'):null;if(!close)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();closeExplanationOverPractice();
  },true);
}
learningFrame.addEventListener('load',bindLearningFrame);setTimeout(bindLearningFrame,0);

function cueContext(){
  const scene=selectedScene(),character=selectedCharacter(),all=parse(localStorage.getItem(KEY.cueState),{})||{},state=all[`${scene}|${character}`]||{},targetId=state.speechId||'';
  if(!targetId||!speech(scene,targetId))return null;const cue=previousSpeech(scene,targetId);return{scene,targetId,cueId:cue?.id||''};
}
function rehearsalContext(){
  const scene=selectedScene(),character=selectedCharacter(),all=parse(localStorage.getItem(KEY.rehearsalState),{})||{},state=all[`${scene}|${character}`]||{},lineId=state.speechId||'';
  return lineId&&speech(scene,lineId)?{scene,lineId}:null;
}
function enhancePracticeDoc(doc,kind){
  if(!doc||!scriptData()||!annotations())return;injectFrameStyle(doc);
  if(kind==='cue'){const c=cueContext();if(!c)return;if(c.cueId)enhanceTextElement(doc.getElementById('cueText'),c.scene,c.cueId);enhanceTextElement(doc.getElementById('answerContent'),c.scene,c.targetId)}
  else if(kind==='rehearsal'){const c=rehearsalContext();if(!c)return;enhanceTextElement(doc.getElementById('line'),c.scene,c.lineId)}
}
function bindPracticeFrame(frame,kind){
  if(!frame)return;let doc;try{doc=frame.contentDocument}catch{return}if(!doc)return;injectFrameStyle(doc);
  if(!boundDocs.has(doc)){
    boundDocs.add(doc);
    doc.addEventListener('click',event=>{
      if(!(event.target instanceof Element))return;
      const word=event.target.closest('.reader-vocab');
      if(word){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openWord(word.dataset.scene,word.dataset.line,word.dataset.lemma,word.dataset.surface,word);return}
      const line=event.target.closest('[data-study-line][data-study-scene]');if(!line)return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openExplanationOverPractice(line.dataset.studyScene,line.dataset.studyLine,line);
    },true);
    new MutationObserver(()=>enhancePracticeDoc(doc,kind)).observe(doc.documentElement,{childList:true,subtree:true,characterData:true});
  }
  enhancePracticeDoc(doc,kind);
}
function enhancePracticeFrame(frame,kind){if(frame)bindPracticeFrame(frame,kind)}
for(const [frame,kind] of [[cueFrame,'cue'],[rehearsalFrame,'rehearsal']]){
  if(!frame)continue;frame.addEventListener('load',()=>bindPracticeFrame(frame,kind));setTimeout(()=>bindPracticeFrame(frame,kind),0);
}

function interceptVocabulary(event){
  const target=event.target instanceof Element?event.target.closest('.reader-vocab'):null;if(!target)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openWord(target.dataset.scene,target.dataset.line,target.dataset.lemma,target.dataset.surface,target);
}
document.addEventListener('click',interceptVocabulary,true);
wordClose.addEventListener('click',()=>closeWord());
wordOverlay.addEventListener('click',event=>{if(event.target===wordOverlay)closeWord()});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(!wordOverlay.hidden){event.preventDefault();closeWord();return}
  if(learningOverlay.classList.contains('study-over-practice')&&!learningOverlay.hidden){event.preventDefault();closeExplanationOverPractice()}
});
wordHandle.addEventListener('pointerdown',event=>{
  if(event.target instanceof Element&&event.target.closest('button'))return;
  drag={id:event.pointerId,startY:event.clientY,startT:performance.now()};wordSheet.classList.add('dragging');try{wordHandle.setPointerCapture(event.pointerId)}catch{}
});
wordHandle.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;wordSheet.style.setProperty('--word-drag',`${Math.max(0,event.clientY-drag.startY)}px`)});
function endDrag(event){
  if(!drag||event.pointerId!==drag.id)return;
  const dy=Math.max(0,event.clientY-drag.startY),dt=Math.max(1,performance.now()-drag.startT),velocity=dy/dt;drag=null;wordSheet.classList.remove('dragging');
  if(dy>86||velocity>.62){closeWord();return}wordSheet.style.setProperty('--word-drag','0px');
}
wordHandle.addEventListener('pointerup',endDrag);wordHandle.addEventListener('pointercancel',endDrag);

new MutationObserver(queueEnhance).observe(app,{childList:true,subtree:true});
window.addEventListener('storage',queueEnhance);
window.addEventListener('hashchange',()=>{
  if(!location.hash.startsWith('#/script')&&!location.hash.startsWith('#/search')&&!location.hash.startsWith('#/cue')&&!location.hash.startsWith('#/rehearsal'))closeWord(false);
  if(learningOverlay.classList.contains('study-over-practice'))closeExplanationOverPractice();queueEnhance();
});
injectStyle();queueEnhance();
window.MTS_STUDY_ANYWHERE=Object.freeze({enhance:queueEnhance,openWord,closeWord,openExplanation:openExplanationOverPractice,closeExplanation:closeExplanationOverPractice});
window.MTS_READER_V2=window.MTS_STUDY_ANYWHERE;
})();