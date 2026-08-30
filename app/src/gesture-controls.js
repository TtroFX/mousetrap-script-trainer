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
const currentFocusPage=()=>document.querySelector('.line-page');
const prepareFocusPage=(page=currentFocusPage())=>{
  if(!page)return null;
  let layer=page.querySelector(':scope > .line-page-motion-layer');
  let surface=layer?.querySelector(':scope > .line-page-surface');
  if(surface)return surface;
  const nav=page.querySelector(':scope > .floating-nav');
  layer=document.createElement('div');
  layer.className='line-page-motion-layer';
  surface=document.createElement('div');
  surface.className='line-page-surface';
  for(const child of [...page.children]){
    if(child===nav)continue;
    surface.appendChild(child);
  }
  layer.appendChild(surface);
  if(nav)page.insertBefore(layer,nav);else page.appendChild(layer);
  return surface;
};
const syncFocusRole=()=>{
  const page=currentFocusPage();
  if(!page)return;
  const card=page.querySelector('.line-page-surface > .card')||page.querySelector(':scope > .card');
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
let pendingFocusTransition=null;
let focusTransitionId=0;
let queuedFocusSteps=0;
let suppressClickUntil=0;
let lastFocusTap=null;
const focusAnimations=new Set();
const interactiveSwipeBlock=target=>!!target.closest?.('input,select,textarea,[contenteditable="true"],[data-no-page-swipe]');
const interactiveDoubleTapBlock=target=>!!target.closest?.('button,a,summary,input,select,textarea,[role="button"],[contenteditable="true"],[data-no-page-doubletap]');
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionProfile=()=>reducedMotion()
  ?{settle:80,commit:110}
  :{settle:150,commit:205};
const stopFocusAnimations=()=>{
  for(const animation of [...focusAnimations]){
    try{animation.cancel?.()}catch{}
  }
  focusAnimations.clear();
};
const runElementAnimation=(element,keyframes,options,onFinish=()=>{})=>{
  if(!element){onFinish();return null}
  const duration=Number(options.duration)||0;
  if(!element.animate){
    const last=keyframes[keyframes.length-1]||{};
    if(last.transform!=null)element.style.transform=last.transform;
    if(last.opacity!=null)element.style.opacity=String(last.opacity);
    setTimeout(onFinish,duration);
    return null;
  }
  const animation=element.animate(keyframes,{...options,fill:'forwards'});
  focusAnimations.add(animation);
  let done=false;
  const finish=()=>{
    if(done)return;
    done=true;
    focusAnimations.delete(animation);
    onFinish();
  };
  const cancel=()=>{
    if(done)return;
    done=true;
    focusAnimations.delete(animation);
  };
  animation.addEventListener('finish',finish,{once:true});
  animation.addEventListener('cancel',cancel,{once:true});
  setTimeout(finish,duration+90);
  return animation;
};
const clearFocusPreview=page=>{
  page?.querySelector(':scope > .line-page-motion-layer > .focus-page-preview')?.remove();
};
const resetFocusPage=page=>{
  if(!page)return;
  stopFocusAnimations();
  const surface=page.querySelector(':scope > .line-page-motion-layer > .line-page-surface');
  surface?.classList.remove('is-focus-swiping','is-focus-settling');
  if(surface){
    surface.style.transform='';
    surface.style.opacity='';
    surface.style.willChange='';
  }
  clearFocusPreview(page);
};
const makePreviewCard=(className='card')=>{
  const card=document.createElement('div');
  card.className=className;
  return card;
};
const ensureFocusPreview=(page,direction)=>{
  if(!page)return null;
  const layer=page.querySelector(':scope > .line-page-motion-layer');
  if(!layer)return null;
  const existing=layer.querySelector(':scope > .focus-page-preview');
  if(existing?.dataset.direction===String(direction))return existing;
  existing?.remove();
  const hit=focusTarget(direction),api=window.MTS_INDEX_ZERO;
  if(!hit||!api?.store)return null;
  const preview=document.createElement('div');
  preview.className='focus-page-preview';
  preview.dataset.direction=String(direction);
  preview.setAttribute('aria-hidden','true');
  preview.style.transform=direction>0?'translate3d(100%,0,0)':'translate3d(-100%,0,0)';

  const lineCard=makePreviewCard();
  const speaker=document.createElement('div');
  speaker.className='speaker-title';
  speaker.textContent=hit.target.speaker||'';
  const text=document.createElement('p');
  text.className='line-detail-text';
  text.textContent=hit.target.text||'';
  const chip=document.createElement('span');
  chip.className='chip';
  chip.textContent=page.querySelector('.line-page-surface .chip, :scope > .card .chip')?.textContent||hit.route.scene;
  lineCard.append(speaker,text,chip);

  const translationCard=makePreviewCard();
  const kicker=document.createElement('div');
  kicker.className='eyebrow';
  kicker.textContent='Translation';
  const translation=document.createElement('p');
  translation.className='translation';
  let translated='';
  try{if(api.store.hasStudy?.())translated=api.store.getTranslation(hit.target.id)||''}catch{}
  translation.textContent=translated||'…';
  translationCard.append(kicker,translation);

  const placeholder=makePreviewCard('card focus-preview-placeholder');
  preview.append(lineCard,translationCard,placeholder);
  layer.insertBefore(preview,layer.querySelector('.line-page-surface'));
  return preview;
};
const previewTransform=(direction,dx)=>`translate3d(calc(${direction>0?'100%':'-100%'} + ${dx}px),0,0)`;
const cancelFocusSwipe=()=>{
  const state=focusSwipe;
  focusSwipe=null;
  if(!state)return;
  const page=state.page?.isConnected?state.page:currentFocusPage();
  if(!page)return;
  const surface=state.surface?.isConnected?state.surface:prepareFocusPage(page);
  if(!surface){focusSettling=false;return}
  const profile=motionProfile();
  const from=getComputedStyle(surface).transform==='none'?'translate3d(0,0,0)':getComputedStyle(surface).transform;
  const preview=page.querySelector(':scope > .line-page-motion-layer > .focus-page-preview');
  const previewDirection=Number(preview?.dataset.direction)||0;
  const previewFrom=preview&&getComputedStyle(preview).transform!=='none'?getComputedStyle(preview).transform:null;
  focusSettling=true;
  surface.classList.remove('is-focus-swiping');
  surface.classList.add('is-focus-settling');
  stopFocusAnimations();
  if(preview&&previewDirection){
    preview.classList.add('is-focus-settling');
    runElementAnimation(preview,[
      {transform:previewFrom||'translate3d(0,0,0)',opacity:1},
      {transform:previewDirection>0?'translate3d(100%,0,0)':'translate3d(-100%,0,0)',opacity:1}
    ],{duration:profile.settle,easing:'cubic-bezier(.22,.72,.24,1)'});
  }
  runElementAnimation(surface,[
    {transform:from,opacity:Number(getComputedStyle(surface).opacity)||1},
    {transform:'translate3d(0,0,0)',opacity:1}
  ],{duration:profile.settle,easing:'cubic-bezier(.22,.72,.24,1)'},()=>{
    focusSettling=false;
    resetFocusPage(page);
  });
};
const beginFocusSwipe=event=>{
  if(event.pointerType==='mouse'||focusSwipe||(overlay&&!overlay.hidden&&!overlay.classList.contains('is-dismissing'))||!event.target.closest?.('.line-page')||interactiveSwipeBlock(event.target))return;
  const page=event.target.closest('.line-page');
  if(focusSettling){
    focusSwipe={
      pointerId:event.pointerId,page,surface:null,originTarget:event.target,queuedOnly:true,
      startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,
      startTime:event.timeStamp||performance.now(),lastTime:event.timeStamp||performance.now(),axis:null,moved:false
    };
    return;
  }
  const surface=prepareFocusPage(page);
  if(!surface)return;
  stopFocusAnimations();
  surface.style.willChange='transform, opacity';
  focusSwipe={
    pointerId:event.pointerId,page,surface,originTarget:event.target,
    startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,
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
  if(state.moved)lastFocusTap=null;
  event.preventDefault();
  if(state.queuedOnly)return;
  const direction=dx<0?1:-1,available=!!focusTarget(direction),page=state.page?.isConnected?state.page:currentFocusPage();
  if(!page)return;
  const surface=state.surface?.isConnected?state.surface:prepareFocusPage(page);
  if(!surface)return;
  state.page=page;state.surface=surface;
  const resisted=available?dx:dx*.28;
  surface.classList.add('is-focus-swiping');
  surface.style.transform=`translate3d(${resisted}px,0,0)`;
  surface.style.opacity=String(Math.max(.94,1-Math.min(Math.abs(resisted)/1400,.06)));
  if(available){
    const preview=ensureFocusPreview(page,direction);
    if(preview){
      preview.style.transform=previewTransform(direction,dx);
      preview.style.opacity='1';
    }
  }else clearFocusPreview(page);
};
const emitFocusTransition=(phase,transition,extra={})=>{
  const detail={phase,id:transition.id,direction:transition.direction,scene:transition.scene,line:transition.line,route:location.hash,...extra};
  window.dispatchEvent(new CustomEvent('mts:focus-transition',{detail}));
};
const preloadFocusData=()=>{
  const store=window.MTS_INDEX_ZERO?.store;
  if(!store)return Promise.resolve();
  const pending=[];
  if(!store.hasStudy?.()&&store.studyState?.status!=='error')pending.push(store.loadStudy?.());
  if(!store.hasStructure?.()&&store.structureState?.status!=='error')pending.push(store.loadStructure?.());
  if(!store.hasStageDirections?.()&&store.stageState?.status!=='error')pending.push(store.loadStageDirections?.());
  return Promise.allSettled(pending.filter(Boolean));
};
const focusDestinationReady=transition=>{
  const current=lineRoute(),store=window.MTS_INDEX_ZERO?.store;
  if(!current||current.scene!==transition.scene||current.line!==transition.line||!store)return null;
  if((!store.hasStudy?.()&&store.studyState?.status!=='error')||(!store.hasStructure?.()&&store.structureState?.status!=='error')||(!store.hasStageDirections?.()&&store.stageState?.status!=='error'))return null;
  const page=currentFocusPage();
  if(!page||page.dataset.focusDestinationLine===transition.line)return null;
  const expected=store.hasStageDirections?.()?store.getStageDirectionsForSpeech(transition.line):[];
  if(expected.some(entry=>entry.actorCueForSpeech===true)&&!page.querySelector('[data-stage-actor-cues]'))return null;
  if(expected.some(entry=>entry.actorCueForSpeech!==true)&&!page.querySelector('[data-stage-context-details]'))return null;
  return{page,surface:prepareFocusPage(page)};
};
const scheduleLoadedFocusEntrance=transition=>{
  const deadline=performance.now()+2600;
  const probe=()=>{
    if(pendingFocusTransition!==transition)return;
    let ready=focusDestinationReady(transition);
    if(!ready&&performance.now()<deadline){requestAnimationFrame(probe);return}
    if(!ready){
      const page=currentFocusPage();
      ready=page?{page,surface:prepareFocusPage(page)}:null;
    }
    if(!ready?.surface){
      document.documentElement.classList.remove('focus-route-pending');
      pendingFocusTransition=null;focusSettling=false;
      emitFocusTransition('failed',transition);
      return;
    }
    const {page,surface}=ready,profile=motionProfile();
    page.dataset.focusDestinationLine=transition.line;
    surface.dataset.focusLoadedTransition=String(transition.id);
    surface.classList.remove('is-focus-swiping');
    surface.classList.add('is-focus-settling','is-focus-entering');
    surface.style.willChange='transform, opacity';
    const from=transition.direction>0?'translate3d(100%,0,0)':'translate3d(-100%,0,0)';
    surface.style.transform=from;
    surface.style.opacity='.98';
    window.scrollTo({top:0,left:0,behavior:'auto'});
    emitFocusTransition('loaded',transition,{surfaceLine:page.dataset.focusDestinationLine});
    document.documentElement.classList.remove('focus-route-pending');
    surface.getBoundingClientRect();
    requestAnimationFrame(()=>{
      if(pendingFocusTransition!==transition||!surface.isConnected)return;
      emitFocusTransition('animationstart',transition,{surfaceLine:page.dataset.focusDestinationLine});
      runElementAnimation(surface,[
        {transform:from,opacity:.98},
        {transform:'translate3d(0,0,0)',opacity:1}
      ],{duration:profile.commit,easing:'cubic-bezier(.2,.78,.2,1)'},()=>{
        surface.classList.remove('is-focus-settling','is-focus-entering');
        surface.style.transform='';surface.style.opacity='';surface.style.willChange='';
        if(pendingFocusTransition===transition)pendingFocusTransition=null;
        focusSettling=false;
        emitFocusTransition('complete',transition,{surfaceLine:page.dataset.focusDestinationLine});
        const queuedDirection=Math.sign(queuedFocusSteps);
        if(queuedDirection){
          queuedFocusSteps-=queuedDirection;
          requestAnimationFrame(()=>animateFocusNavigation(queuedDirection));
        }
      });
    });
  };
  requestAnimationFrame(probe);
};
const animateFocusCommit=(direction,state={})=>{
  const hit=focusTarget(direction);
  if(!hit){
    if(focusSwipe)cancelFocusSwipe();
    return false;
  }
  focusSwipe=null;
  focusSettling=true;
  lastFocusTap=null;
  suppressClickUntil=performance.now()+440;
  stopFocusAnimations();
  const transition={id:++focusTransitionId,direction,scene:hit.route.scene,line:hit.target.id,sourceScene:hit.route.scene,sourceLine:hit.route.line};
  pendingFocusTransition=transition;
  emitFocusTransition('preload',transition);
  preloadFocusData().then(()=>{
    if(pendingFocusTransition!==transition)return;
    const current=lineRoute();
    if(!current||current.scene!==transition.sourceScene||current.line!==transition.sourceLine){pendingFocusTransition=null;focusSettling=false;return}
    document.documentElement.classList.add('focus-route-pending');
    emitFocusTransition('route',transition);
    location.hash=`#/line?scene=${encodeURIComponent(transition.scene)}&line=${encodeURIComponent(transition.line)}`;
  });
  return true;
};
const animateFocusNavigation=direction=>{
  if(!lineRoute())return false;
  if(focusSettling){queuedFocusSteps=Math.max(-4,Math.min(4,queuedFocusSteps+(direction>0?1:-1)));return true}
  const page=currentFocusPage(),surface=prepareFocusPage(page);
  if(!page||!surface||!focusTarget(direction))return false;
  return animateFocusCommit(direction,{page,surface});
};
const handleFocusTap=(event,state)=>{
  if(event.pointerType==='mouse'||interactiveDoubleTapBlock(state.originTarget)){
    lastFocusTap=null;
    return false;
  }
  const page=state.page?.isConnected?state.page:currentFocusPage();
  if(!page)return false;
  const rect=page.getBoundingClientRect(),mid=rect.left+rect.width/2;
  const direction=event.clientX<mid?-1:1;
  const now=performance.now();
  const previous=lastFocusTap;
  const isDouble=!!previous&&previous.direction===direction&&now-previous.time<=360&&Math.abs(event.clientX-previous.x)<=56&&Math.abs(event.clientY-previous.y)<=56;
  if(!isDouble){
    lastFocusTap={direction,time:now,x:event.clientX,y:event.clientY};
    return false;
  }
  lastFocusTap=null;
  suppressClickUntil=now+440;
  return animateFocusNavigation(direction);
};
const endFocusSwipe=event=>{
  const state=focusSwipe;
  if(!state||event.pointerId!==state.pointerId)return false;
  const dx=event.clientX-state.startX,dy=event.clientY-state.startY,ax=Math.abs(dx),ay=Math.abs(dy);
  const duration=Math.max(1,(event.timeStamp||performance.now())-state.startTime);
  const inferredAxis=state.axis??(Math.max(ax,ay)>=10?(ax>ay*1.08?'x':ay>ax*1.08?'y':null):null);
  if(state.queuedOnly){
    focusSwipe=null;
    const width=Math.max(320,window.innerWidth||320);
    const distanceThreshold=Math.min(88,Math.max(46,width*.14));
    const velocity=ax/duration;
    const commit=inferredAxis==='x'&&ax>ay*1.05&&(ax>=distanceThreshold||(ax>=30&&velocity>=.48));
    if(commit){
      const direction=dx<0?1:-1;
      queuedFocusSteps=Math.max(-4,Math.min(4,queuedFocusSteps+direction));
      return true;
    }
    return false;
  }
  if(!inferredAxis&&ax<=12&&ay<=12&&duration<=460){
    focusSwipe=null;
    resetFocusPage(state.page);
    return handleFocusTap(event,state);
  }
  if(inferredAxis==='y'){
    focusSwipe=null;
    lastFocusTap=null;
    resetFocusPage(state.page);
    return false;
  }
  if(inferredAxis==='x'&&(state.moved||ax>=14))suppressClickUntil=performance.now()+320;
  const width=Math.max(320,state.surface?.clientWidth||window.innerWidth||320);
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
  lastFocusTap=null;
  cancelFocusSwipe();
};

document.addEventListener('pointerdown',beginFocusSwipe,{passive:true,capture:true});
document.addEventListener('pointermove',moveFocusSwipe,{passive:false,capture:true});
document.addEventListener('pointerup',endFocusSwipe,{passive:true,capture:true});
document.addEventListener('pointercancel',cancelFocusPointer,{passive:true,capture:true});
document.addEventListener('click',event=>{
  if(!event.target.closest?.('.line-page'))return;
  const navButton=event.target.closest('.floating-nav [data-prev],.floating-nav [data-next]');
  if(navButton&&!navButton.disabled){
    event.preventDefault();
    event.stopImmediatePropagation();
    animateFocusNavigation(navButton.hasAttribute('data-next')?1:-1);
    return;
  }
  if(performance.now()<suppressClickUntil){
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
},{capture:true});
window.addEventListener('blur',()=>{lastFocusTap=null;if(focusSwipe)cancelFocusSwipe()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){lastFocusTap=null;if(focusSwipe)cancelFocusSwipe()}});
window.addEventListener('hashchange',()=>{
  focusSwipe=null;
  lastFocusTap=null;
  stopFocusAnimations();
  const current=lineRoute(),transition=pendingFocusTransition;
  if(transition&&current?.scene===transition.scene&&current?.line===transition.line){
    focusSettling=true;
    scheduleLoadedFocusEntrance(transition);
  }else{
    pendingFocusTransition=null;
    focusSettling=false;
    queuedFocusSteps=0;
    suppressClickUntil=0;
    document.documentElement.classList.remove('focus-route-pending');
  }
  scheduleFocusRoleSync();
  resetFocusScroll();
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

  window.MTS_GESTURES=Object.freeze({version:8,closeSheet,resetSheet,moveFocusLine,navigateFocusLine:animateFocusNavigation,syncFocusRole,resetFocusScroll,transitionState:()=>pendingFocusTransition?{...pendingFocusTransition}:null});
}
