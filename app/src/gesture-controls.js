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

let focusSwipe=null;
let focusSettling=false;
let pendingEnterDirection=0;
let suppressClickUntil=0;
let focusAnimation=null;
const interactiveSwipeBlock=target=>!!target.closest?.('input,select,textarea,[contenteditable="true"],[data-no-page-swipe]');
const currentFocusPage=()=>document.querySelector('.line-page');
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionProfile=()=>reducedMotion()
  ?{settle:80,commit:100,enter:120,enterOffset:14}
  :{settle:150,commit:190,enter:220,enterOffset:44};
const stopFocusAnimation=()=>{
  try{focusAnimation?.cancel?.()}catch{}
  focusAnimation=null;
};
const resetFocusPage=page=>{
  if(!page)return;
  stopFocusAnimation();
  page.classList.remove('is-focus-swiping','is-focus-settling','focus-enter-next','focus-enter-prev','focus-enter-active');
  page.style.transform='';
  page.style.opacity='';
  page.style.willChange='';
};
const runPageAnimation=(page,keyframes,options,onFinish)=>{
  stopFocusAnimation();
  if(!page?.animate){
    const last=keyframes[keyframes.length-1]||{};
    if(last.transform!=null)page.style.transform=last.transform;
    if(last.opacity!=null)page.style.opacity=String(last.opacity);
    setTimeout(onFinish,Number(options.duration)||0);
    return null;
  }
  const animation=page.animate(keyframes,{...options,fill:'forwards'});
  focusAnimation=animation;
  let done=false;
  const finish=()=>{
    if(done)return;
    done=true;
    if(focusAnimation===animation)focusAnimation=null;
    onFinish();
  };
  animation.addEventListener('finish',finish,{once:true});
  animation.addEventListener('cancel',()=>{if(focusAnimation===animation)focusAnimation=null},{once:true});
  setTimeout(finish,(Number(options.duration)||0)+80);
  return animation;
};
const cancelFocusSwipe=()=>{
  const state=focusSwipe;
  focusSwipe=null;
  if(!state)return;
  const page=state.page?.isConnected?state.page:currentFocusPage();
  if(!page)return;
  const profile=motionProfile();
  const from=getComputedStyle(page).transform==='none'?'translate3d(0,0,0)':getComputedStyle(page).transform;
  page.classList.remove('is-focus-swiping');
  page.classList.add('is-focus-settling');
  runPageAnimation(page,[
    {transform:from,opacity:Number(getComputedStyle(page).opacity)||1},
    {transform:'translate3d(0,0,0)',opacity:1}
  ],{duration:profile.settle,easing:'cubic-bezier(.22,.72,.24,1)'},()=>resetFocusPage(page));
};
const beginFocusSwipe=event=>{
  if(event.pointerType==='mouse'||focusSwipe||focusSettling||overlay&&!overlay.hidden&&!overlay.classList.contains('is-dismissing')||!event.target.closest?.('.line-page')||interactiveSwipeBlock(event.target))return;
  const page=event.target.closest('.line-page');
  stopFocusAnimation();
  page.style.willChange='transform, opacity';
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
  page.style.transform=`translate3d(${resisted}px,0,0)`;
  page.style.opacity=String(Math.max(.88,1-Math.min(Math.abs(resisted)/900,.12)));
};
const animateFocusCommit=(direction,state)=>{
  const hit=focusTarget(direction);
  if(!hit){cancelFocusSwipe();return false}
  focusSwipe=null;
  focusSettling=true;
  suppressClickUntil=performance.now()+380;
  const page=state.page?.isConnected?state.page:currentFocusPage();
  const navigate=()=>{
    pendingEnterDirection=direction;
    focusSettling=false;
    moveFocusLine(direction);
  };
  if(!page){navigate();return true}
  const profile=motionProfile();
  const computed=getComputedStyle(page);
  const from=computed.transform==='none'?'translate3d(0,0,0)':computed.transform;
  page.classList.remove('is-focus-swiping');
  page.classList.add('is-focus-settling');
  page.style.willChange='transform, opacity';
  runPageAnimation(page,[
    {transform:from,opacity:Number(computed.opacity)||1},
    {transform:direction>0?'translate3d(-112vw,0,0)':'translate3d(112vw,0,0)',opacity:.84}
  ],{duration:profile.commit,easing:'cubic-bezier(.22,.72,.24,1)'},navigate);
  return true;
};
const endFocusSwipe=event=>{
  const state=focusSwipe;
  if(!state||event.pointerId!==state.pointerId)return false;
  const dx=event.clientX-state.startX,dy=event.clientY-state.startY,ax=Math.abs(dx),ay=Math.abs(dy);
  const duration=Math.max(1,(event.timeStamp||performance.now())-state.startTime);
  const inferredAxis=state.axis??(Math.max(ax,ay)>=10?(ax>ay*1.08?'x':ay>ax*1.08?'y':null):null);
  if(inferredAxis==='x'&&(state.moved||ax>=14))suppressClickUntil=performance.now()+300;
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
  if(!direction)return;
  const profile=motionProfile();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const page=currentFocusPage();
    if(!page)return;
    page.style.willChange='transform, opacity';
    const offset=direction>0?profile.enterOffset:-profile.enterOffset;
    runPageAnimation(page,[
      {transform:`translate3d(${offset}px,0,0)`,opacity:.9},
      {transform:'translate3d(0,0,0)',opacity:1}
    ],{duration:profile.enter,easing:'cubic-bezier(.22,.72,.24,1)'},()=>resetFocusPage(page));
  }));
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
window.addEventListener('hashchange',()=>{
  focusSwipe=null;
  focusSettling=false;
  scheduleFocusRoleSync();
  resetFocusScroll();
  animateIncomingFocusPage();
});
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

  window.MTS_GESTURES=Object.freeze({version:5,closeSheet,resetSheet,moveFocusLine,syncFocusRole,resetFocusScroll});
}
