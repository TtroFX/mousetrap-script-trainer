// Reader bottom-sheet interaction layer, r7.
(()=>{'use strict';
const overlay=document.getElementById('learningOverlay');
const panel=document.getElementById('learningSheet');
const handle=document.getElementById('learningSheetHandle');
const closeButton=document.getElementById('learningSheetClose');
const frame=document.getElementById('learningFrame');
if(!overlay||!panel||!handle||!closeButton||!frame)return;

const KEY={
  selectedScene:'mts.selectedSceneId',
  character:'mts.characterId',
  lineCurrent:'mts.lineDetail.current',
  readerProgress:'mts.reader.progress',
  readerLast:'mts.reader.lastPosition'
};
let restoreFocus=null;
let closeTimer=0;
let drag=null;

function parse(raw,f=null){try{return raw?JSON.parse(raw):f}catch{return f}}
function scriptData(){return window.MTS_SHARED_SCRIPT_DATA||null}
function speech(scene,id){return scriptData()?.[scene]?.speeches?.find(x=>x.id===id)||null}
function currentRole(){return localStorage.getItem(KEY.character)||''}
function markSeen(scene,id){
  const x=speech(scene,id);if(!x)return;
  const p=parse(localStorage.getItem(KEY.readerProgress),{})||{};
  p.version=1;
  p.globalSeen=Array.isArray(p.globalSeen)?p.globalSeen:[];
  p.roles=p.roles&&typeof p.roles==='object'?p.roles:{};
  if(!p.globalSeen.includes(id))p.globalSeen.push(id);
  const role=currentRole();
  if(role&&x.speaker===role){if(!Array.isArray(p.roles[role]))p.roles[role]=[];if(!p.roles[role].includes(id))p.roles[role].push(id)}
  const now=new Date().toISOString();
  p.last={sceneId:scene,lineId:id,role:role||'',updatedAt:now};p.updatedAt=now;
  localStorage.setItem(KEY.readerProgress,JSON.stringify(p));
  localStorage.setItem(KEY.readerLast,JSON.stringify(p.last));
}
function setCurrent(scene,id){
  if(!speech(scene,id))return false;
  localStorage.setItem(KEY.selectedScene,scene);
  localStorage.setItem(KEY.lineCurrent,JSON.stringify({sceneId:scene,lineId:id}));
  markSeen(scene,id);
  return true;
}
function sendLine(scene,id){
  if(!setCurrent(scene,id))return;
  const api=frame.contentWindow?.MTS_LEARNING;
  if(api?.showLine)api.showLine(scene,id);
  else frame.contentWindow?.postMessage({type:'mts:line',sceneId:scene,lineId:id},'*');
}
function openSheet(scene,id,source=null){
  if(!setCurrent(scene,id))return;
  clearTimeout(closeTimer);
  restoreFocus=source||document.activeElement;
  overlay.classList.remove('closing');
  panel.classList.remove('dragging');
  panel.style.setProperty('--sheet-drag','0px');
  overlay.hidden=false;
  document.body.classList.add('line-sheet-open');
  requestAnimationFrame(()=>sendLine(scene,id));
}
function finishHide(){
  overlay.hidden=true;
  overlay.classList.remove('closing');
  panel.classList.remove('dragging');
  panel.style.setProperty('--sheet-drag','0px');
  document.body.classList.remove('line-sheet-open');
  const target=restoreFocus;restoreFocus=null;
  if(target?.isConnected)target.focus({preventScroll:true});
}
function closeSheet(animate=true){
  clearTimeout(closeTimer);
  if(overlay.hidden){finishHide();return}
  if(!animate){finishHide();return}
  overlay.classList.add('closing');
  document.body.classList.remove('line-sheet-open');
  closeTimer=setTimeout(finishHide,220);
}
function sibling(delta){
  const c=parse(localStorage.getItem(KEY.lineCurrent));
  const rows=scriptData()?.[c?.sceneId]?.speeches||[];
  const i=rows.findIndex(x=>x.id===c?.lineId),n=i+delta;
  return n>=0&&n<rows.length?{scene:c.sceneId,id:rows[n].id}:null;
}
function moveLine(delta){const n=sibling(delta);if(n)sendLine(n.scene,n.id)}
function injectFrameUI(){
  let doc;try{doc=frame.contentDocument}catch{return}
  if(!doc?.documentElement)return;
  if(!doc.getElementById('mts-reader-sheet-style')){
    const style=doc.createElement('style');style.id='mts-reader-sheet-style';style.textContent=`
      .wrap{padding-bottom:calc(108px + env(safe-area-inset-bottom))!important}
      #close{display:none!important}
      .bar{min-height:48px;padding-left:4px;padding-right:4px}
      #prevLine,#nextLine{position:fixed!important;bottom:calc(14px + env(safe-area-inset-bottom));z-index:1000;width:58px!important;height:58px!important;min-height:58px!important;padding:0!important;border-radius:999px!important;background:rgba(38,35,31,.72)!important;color:#fff!important;box-shadow:0 10px 28px rgba(0,0,0,.22)!important;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font-size:0!important;opacity:.88;transition:opacity .15s,transform .15s}
      #prevLine{left:18px}#nextLine{right:18px}
      #prevLine::before{content:'←';font-size:27px;line-height:1}#nextLine::before{content:'→';font-size:27px;line-height:1}
      #prevLine:active,#nextLine:active{opacity:1;transform:scale(.94)}
      #prevLine:disabled,#nextLine:disabled{opacity:.24!important;box-shadow:none!important}
      @media(max-width:520px){#prevLine,#nextLine{width:54px!important;height:54px!important;min-height:54px!important;bottom:calc(10px + env(safe-area-inset-bottom))}#prevLine{left:12px}#nextLine{right:12px}}
    `;doc.head.appendChild(style);
  }
  if(doc.documentElement.dataset.mtsReaderSheetBound==='1')return;
  doc.documentElement.dataset.mtsReaderSheetBound='1';
  doc.addEventListener('click',event=>{
    const el=event.target?.closest?event.target.closest('#close,#closeFail,#prevLine,#nextLine'):null;
    if(!el)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    if(el.id==='close'||el.id==='closeFail'){closeSheet();return}
    if(el.disabled)return;
    moveLine(el.id==='prevLine'?-1:1);
  },true);
}

frame.addEventListener('load',()=>{injectFrameUI();const c=parse(localStorage.getItem(KEY.lineCurrent));if(c?.sceneId&&c?.lineId)setTimeout(()=>sendLine(c.sceneId,c.lineId),0)});
setTimeout(injectFrameUI,0);

function interceptReaderClick(event){
  if(!(event.target instanceof Element))return;
  const line=event.target.closest('.line-row[data-line]');
  if(line&&location.hash.startsWith('#/script')){
    const scene=localStorage.getItem(KEY.selectedScene)||'act1-scene1';
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    openSheet(scene,line.dataset.line,line);return;
  }
  const hit=event.target.closest('[data-search-line][data-search-scene]');
  if(hit&&location.hash.startsWith('#/search')){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    openSheet(hit.dataset.searchScene,hit.dataset.searchLine,hit);
  }
}
document.addEventListener('click',interceptReaderClick,true);

closeButton.addEventListener('click',()=>closeSheet());
overlay.addEventListener('click',event=>{if(event.target===overlay)closeSheet()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden){event.preventDefault();closeSheet()}});

handle.addEventListener('pointerdown',event=>{
  if(event.target instanceof Element&&event.target.closest('button'))return;
  drag={id:event.pointerId,startY:event.clientY,lastY:event.clientY,startT:performance.now(),lastT:performance.now()};
  panel.classList.add('dragging');
  try{handle.setPointerCapture(event.pointerId)}catch{}
});
handle.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;
  const dy=Math.max(0,event.clientY-drag.startY);drag.lastY=event.clientY;drag.lastT=performance.now();
  panel.style.setProperty('--sheet-drag',`${dy}px`);
});
function endDrag(event){
  if(!drag||event.pointerId!==drag.id)return;
  const dy=Math.max(0,event.clientY-drag.startY),dt=Math.max(1,performance.now()-drag.startT),velocity=dy/dt;
  drag=null;panel.classList.remove('dragging');
  if(dy>90||velocity>.65){closeSheet();return}
  panel.style.setProperty('--sheet-drag','0px');
}
handle.addEventListener('pointerup',endDrag);handle.addEventListener('pointercancel',endDrag);

window.addEventListener('message',event=>{
  const m=event.data||{};
  if(m.type==='mts:close-line'){closeSheet();return}
  if(m.type==='mts:line-detail-changed'&&m.sceneId&&m.lineId)setCurrent(m.sceneId,m.lineId);
});
window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#/line')&&!location.hash.startsWith('#/script')&&!location.hash.startsWith('#/search'))closeSheet(false)});
window.MTS_READER_SHEET=Object.freeze({open:openSheet,close:closeSheet,next:()=>moveLine(1),prev:()=>moveLine(-1)});
})();
