const overlay=document.getElementById('word-overlay');
const sheet=overlay?.querySelector('.word-sheet');

// Fallback for browsers where overscroll-behavior alone does not fully suppress
// pull-to-refresh on a short/empty page.
let rootStartY=null;
document.addEventListener('touchstart',event=>{
  if(event.touches.length!==1||event.target.closest?.('.word-sheet')){rootStartY=null;return}
  rootStartY=window.scrollY<=0?event.touches[0].clientY:null;
},{passive:true,capture:true});
document.addEventListener('touchmove',event=>{
  if(rootStartY==null||event.touches.length!==1)return;
  if(window.scrollY<=0&&event.touches[0].clientY>rootStartY+2)event.preventDefault();
},{passive:false,capture:true});
for(const type of ['touchend','touchcancel'])document.addEventListener(type,()=>{rootStartY=null},{passive:true,capture:true});

const resetSheet=()=>{
  if(!sheet||!overlay)return;
  sheet.classList.remove('is-dragging','is-dismissing');
  overlay.classList.remove('is-dismissing');
  sheet.style.transform='';
};
const closeSheet=()=>{
  if(!sheet||!overlay||overlay.hidden)return;
  sheet.classList.remove('is-dragging');
  sheet.classList.add('is-dismissing');
  overlay.classList.add('is-dismissing');
  const finish=()=>{overlay.hidden=true;resetSheet()};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)finish();
  else setTimeout(finish,180);
};

const lineRoute=()=>{
  const raw=location.hash.replace(/^#/,'');
  const [path,query='']=raw.split('?');
  if(path!=='/line')return null;
  const q=new URLSearchParams(query),scene=q.get('scene'),line=q.get('line');
  return scene&&line?{scene,line}:null;
};
const syncFocusRole=()=>{
  const page=document.querySelector('.line-page');
  if(!page)return;
  const card=page.querySelector(':scope > .card');
  const route=lineRoute(),api=window.MTS_INDEX_ZERO;
  if(!card||!route||!api?.store||!api?.state)return;
  const speech=api.store.getSpeech(route.scene,route.line),role=api.state.role?.();
  const mine=!!role&&speech?.speaker===role;
  card.classList.toggle('selected-role-line',mine);
  card.classList.toggle('focus-role-line',mine);
  if(mine)card.dataset.ownRole='true';else delete card.dataset.ownRole;
};
const scheduleFocusRoleSync=()=>requestAnimationFrame(syncFocusRole);
const resetFocusScroll=()=>{
  if(!lineRoute())return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'})));
};
const moveFocusLine=direction=>{
  const route=lineRoute(),api=window.MTS_INDEX_ZERO;
  if(!route||!api?.store)return false;
  const rows=api.store.getScene(route.scene),index=rows.findIndex(x=>x.id===route.line);
  if(index<0)return false;
  const target=rows[index+(direction>0?1:-1)];
  if(!target)return false;
  location.hash=`#/line?scene=${encodeURIComponent(route.scene)}&line=${encodeURIComponent(target.id)}`;
  return true;
};
let focusSwipe=null;
const focusSwipeBlocked=target=>!!target.closest?.('button,a,input,select,textarea,summary,.vocab-inline,.word-row,.word-sheet');
const beginFocusSwipe=event=>{
  if(event.pointerType==='mouse'||overlay&&!overlay.hidden||!event.target.closest?.('.line-page')||focusSwipeBlocked(event.target)){focusSwipe=null;return}
  focusSwipe={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,startTime:event.timeStamp||performance.now()};
};
const endFocusSwipe=event=>{
  if(!focusSwipe||event.pointerId!==focusSwipe.pointerId){focusSwipe=null;return false}
  const dx=event.clientX-focusSwipe.startX,dy=event.clientY-focusSwipe.startY,duration=Math.max(1,(event.timeStamp||performance.now())-focusSwipe.startTime);
  focusSwipe=null;
  if(Math.abs(dx)<56||Math.abs(dx)<=Math.abs(dy)*1.25||duration>1000)return false;
  return moveFocusLine(dx<0?1:-1);
};
document.addEventListener('pointerdown',beginFocusSwipe,{passive:true});
document.addEventListener('pointerup',endFocusSwipe,{passive:true});
document.addEventListener('pointercancel',()=>{focusSwipe=null},{passive:true});
window.addEventListener('hashchange',()=>{scheduleFocusRoleSync();resetFocusScroll()});
queueMicrotask(()=>{
  scheduleFocusRoleSync();
  window.MTS_INDEX_ZERO?.store?.addEventListener?.('ready',scheduleFocusRoleSync);
});

if(sheet&&overlay){
  let gesture=null;
  const start=(x,y,time=performance.now())=>{gesture={startX:x,startY:y,startTime:time,lastY:y,lastTime:time}};
  const move=(x,y,time=performance.now(),event=null)=>{
    if(!gesture)return;
    const dx=x-gesture.startX,dy=y-gesture.startY;
    // Preview follows the finger only at the sheet's top edge. A fast downward
    // flick can still dismiss from any scroll position when the gesture ends.
    if(dy>0&&Math.abs(dy)>Math.abs(dx)*1.15&&sheet.scrollTop<=1){
      event?.preventDefault?.();
      sheet.classList.add('is-dragging');
      sheet.style.transform=`translateY(${Math.min(dy*.82,window.innerHeight)}px)`;
    }
    gesture.lastY=y;gesture.lastTime=time;
  };
  const end=(x,y,time=performance.now())=>{
    if(!gesture)return false;
    const dx=x-gesture.startX,dy=y-gesture.startY,duration=Math.max(1,time-gesture.startTime);
    const vertical=dy>0&&Math.abs(dy)>Math.abs(dx)*1.15;
    // “Quick flick down”: available from anywhere inside the sheet.
    const dismiss=vertical&&((dy>=64&&duration<=260)||(dy>=120&&duration<=520));
    gesture=null;
    if(dismiss){closeSheet();return true}
    resetSheet();return false;
  };
  const cancel=()=>{gesture=null;resetSheet()};

  sheet.addEventListener('touchstart',event=>{if(event.touches.length===1){const t=event.touches[0];start(t.clientX,t.clientY)}},{passive:true});
  sheet.addEventListener('touchmove',event=>{if(event.touches.length===1){const t=event.touches[0];move(t.clientX,t.clientY,performance.now(),event)}},{passive:false});
  sheet.addEventListener('touchend',event=>{const t=event.changedTouches[0];if(t)end(t.clientX,t.clientY)},{passive:true});
  sheet.addEventListener('touchcancel',cancel,{passive:true});

  // Pointer support covers mouse/pen and allows deterministic desktop QA.
  sheet.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch')start(event.clientX,event.clientY,event.timeStamp)});
  sheet.addEventListener('pointermove',event=>{if(event.pointerType!=='touch'&&gesture)move(event.clientX,event.clientY,event.timeStamp,event)});
  sheet.addEventListener('pointerup',event=>{if(event.pointerType!=='touch'&&gesture)end(event.clientX,event.clientY,event.timeStamp)});
  sheet.addEventListener('pointercancel',event=>{if(event.pointerType!=='touch')cancel()});

  window.MTS_GESTURES=Object.freeze({version:3,closeSheet,resetSheet,moveFocusLine,syncFocusRole,resetFocusScroll});
}
