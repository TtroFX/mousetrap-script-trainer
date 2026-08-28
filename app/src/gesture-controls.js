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
const focusTarget=direction=>{
  const route=lineRoute(),api=window.MTS_INDEX_ZERO;
  if(!route||!api?.store)return null;
  const rows=api.store.getScene(route.scene),index=rows.findIndex(x=>x.id===route.line);
  if(index<0)return null;
  const target=rows[index+(direction>0?1:-1)];
  return target?{route,target}:null;
};
const moveFocusLine=direction=>{
  const hit=focusTarget(direction);
  if(!hit)return false;
  location.hash=`#/line?scene=${encodeURIComponent(hit.route.scene)}&line=${encodeURIComponent(hit.target.id)}`;
  return true;
};

const REDUCED_MOTION=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
let focusSwipe=null;
let focusSettling=false;
let pendingEnterDirection=0;
let suppressClickUntil=0;
const interactiveSwipeBlock=target=>!!target.closest?.('input,select,textarea,[contenteditable="true"],[data-no-page-swipe]');
const currentFocusPage=()=>document.querySelector('.line-page');
const resetFocusPage=page=>{
  if(!page)return;
  page.classList.remove('is-focus-swiping','is-focus-settling');
  page.style.removeProperty('--focus-swipe-x');
  page.style.removeProperty('--focus-swipe-opacity');
};
const cancelFocusSwipe=()=>{
  const state=focusSwipe;
  focusSwipe=null;
  if(!state)return;
  const page=state.page?.isConnected?state.page:currentFocusPage();
  if(!page)return;
  if(REDUCED_MOTION()){resetFocusPage(page);return}
  page.classList.remove('is-focus-swiping');
  page.classList.add('is-focus-settling');
  page.style.setProperty('--focus-swipe-x','0px');
  page.style.setProperty('--focus-swipe-opacity','1');
  setTimeout(()=>resetFocusPage(page),170);
};
const beginFocusSwipe=event=>{
  if(event.pointerType==='mouse'||focusSwipe||focusSettling||overlay&&!overlay.hidden&&!overlay.classList.contains('is-dismissing')||!event.target.closest?.('.line-page')||interactiveSwipeBlock(event.target))return;
  const page=event.target.closest('.line-page');
  focusSwipe={
    pointerId:event.pointerId,page,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,
    startTime:event.timeStamp||performance.now(),lastTime:event.timeStamp||performance.now(),axis:null,moved:false
  };
  try{page.setPointerCapture?.(event.pointerId)}catch{}
};
const moveFocusSwipe=event=>{
  const state=focusSwipe;
  if(!state||event.pointerId!==state.pointerId)return;
  const dx=event.clientX-state.startX,dy=event.clientY-state.startY,ax=Math.abs(dx),ay=Math.abs(dy);
  if(!state.axis&&Math.max(ax,ay)>=10){
    if(ax>ay*1.08)state.axis='x';
    else if(ay>ax*1.08)state.axis='y';
  }
  state.lastX=event.clientX;state.lastY=event.clientY;state.lastTime=event.timeStamp||performance.now();
  if(state.axis!=='x')return;
  state.moved=state.moved||ax>=14;
  event.preventDefault();
  const direction=dx<0?1:-1,available=!!focusTarget(direction),page=state.page?.isConnected?state.page:currentFocusPage();
  if(!page)return;
  state.page=page;
  const resisted=available?dx:dx*.28;
  page.classList.add('is-focus-swiping');
  page.style.setProperty('--focus-swipe-x',`${resisted}px`);
  page.style.setProperty('--focus-swipe-opacity',String(Math.max(.9,1-Math.min(Math.abs(resisted)/1200,.1))));
};
const animateFocusCommit=(direction,state)=>{
  const hit=focusTarget(direction);
  if(!hit){cancelFocusSwipe();return false}
  focusSwipe=null;
  focusSettling=true;
  suppressClickUntil=performance.now()+320;
  const page=state.page?.isConnected?state.page:currentFocusPage();
  const navigate=()=>{
    pendingEnterDirection=direction;
    focusSettling=false;
    moveFocusLine(direction);
  };
  if(!page||REDUCED_MOTION()){navigate();return true}
  page.classList.remove('is-focus-swiping');
  page.classList.add('is-focus-settling');
  page.style.setProperty('--focus-swipe-x',direction>0?'-108vw':'108vw');
  page.style.setProperty('--focus-swipe-opacity','.88');
  setTimeout(navigate,155);
  return true;
};
const endFocusSwipe=event=>{
  const state=focusSwipe;
  if(!state||event.pointerId!==state.pointerId)return false;
  const dx=event.clientX-state.startX,dy=event.clientY-state.startY,ax=Math.abs(dx),ay=Math.abs(dy);
  const duration=Math.max(1,(event.timeStamp||performance.now())-state.startTime);
  const inferredAxis=state.axis??(Math.max(ax,ay)>=10?(ax>ay*1.08?'x':ay>ax*1.08?'y':null):null);
  if(inferredAxis==='x'&&(state.moved||ax>=14))suppressClickUntil=performance.now()+260;
  const width=Math.max(320,state.page?.clientWidth||window.innerWidth||320);
  const distanceThreshold=Math.min(88,Math.max(46,width*.14));
  const velocity=ax/duration;
  const horizontal=inferredAxis==='x'&&ax>ay*1.05;
  const commit=horizontal&&(ax>=distanceThreshold||(ax>=30&&velocity>=.48));
  if(commit)return animateFocusCommit(dx<0?1:-1,state);
  cancelFocusSwipe();
  return false;
};
const cancelFocusPointer=event=>{
  if(!focusSwipe||event.pointerId!==focusSwipe.pointerId)return;
  cancelFocusSwipe();
};
const animateIncomingFocusPage=()=>{
  const direction=pendingEnterDirection;
  pendingEnterDirection=0;
  if(!direction||REDUCED_MOTION())return;
  requestAnimationFrame(()=>{
    const page=currentFocusPage();
    if(!page)return;
    page.classList.add(direction>0?'focus-enter-next':'focus-enter-prev');
    requestAnimationFrame(()=>page.classList.add('focus-enter-active'));
    setTimeout(()=>page.classList.remove('focus-enter-next','focus-enter-prev','focus-enter-active'),190);
  });
};

document.addEventListener('pointerdown',beginFocusSwipe,{passive:true,capture:true});
document.addEventListener('pointermove',moveFocusSwipe,{passive:false,capture:true});
document.addEventListener('pointerup',endFocusSwipe,{passive:true,capture:true});
document.addEventListener('pointercancel',cancelFocusPointer,{passive:true,capture:true});
document.addEventListener('click',event=>{
  if(performance.now()>=suppressClickUntil||!event.target.closest?.('.line-page'))return;
  event.preventDefault();
  event.stopImmediatePropagation();
},{capture:true});
window.addEventListener('blur',()=>{if(focusSwipe)cancelFocusSwipe()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&focusSwipe)cancelFocusSwipe()});
window.addEventListener('hashchange',()=>{focusSwipe=null;scheduleFocusRoleSync();resetFocusScroll();animateIncomingFocusPage()});
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

  window.MTS_GESTURES=Object.freeze({version:4,closeSheet,resetSheet,moveFocusLine,syncFocusRole,resetFocusScroll});
}
