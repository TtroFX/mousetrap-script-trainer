import {
  COMMIT_EASING,SETTLE_EASING,motionProfile,apiReady,ensureRequiredData,visualDataReady,
  readRoute,adjacentRoute,buildVisualPreview,currentPage,prepareSurface,clearSurfaceMotion,
  syncFocusRole,resetFocusScroll
} from './line-page-runtime.js';
import {
  activateLineScroll,bindSurfaceScroll,preparePreviewScroll,scheduleLineScroll
} from './line-independent-scroll.js';
import {transitionActive,transitionState,setRestartHandler,interruptTransition,runTransition} from './line-transition-engine.js';

const navStyle=document.createElement('style');
navStyle.textContent='.line-nav-v2-overlay .floating-nav{pointer-events:auto!important}.line-nav-v2-overlay .floating-nav>button{pointer-events:auto!important}';
document.head.append(navStyle);

const AXIS_LOCK_PX=8;
const AXIS_DOMINANCE=1.08;
const COMMIT_MIN_PX=30;
const COMMIT_MAX_PX=56;
const COMMIT_RATIO=.075;
const FLICK_MIN_PX=18;
const FLICK_VELOCITY=.18;
const resolveAxis=(ax,ay)=>{
  if(Math.max(ax,ay)<AXIS_LOCK_PX)return null;
  if(ax>ay*AXIS_DOMINANCE)return'x';
  if(ay>ax*AXIS_DOMINANCE)return'y';
  return null;
};
const commitThreshold=width=>Math.min(COMMIT_MAX_PX,Math.max(COMMIT_MIN_PX,width*COMMIT_RATIO));

let swipe=null,lastTap=null,suppressClickUntil=0,committing=false,settling=null;
const interactiveSwipeBlock=target=>!!target.closest?.('input,select,textarea,[contenteditable="true"],[data-no-page-swipe]');
const interactiveTapBlock=target=>!!target.closest?.('button,a,summary,input,select,textarea,[role="button"],[contenteditable="true"],[data-no-page-doubletap]');
const previewTransform=(direction,dx)=>`translate3d(calc(${direction>0?'100%':'-100%'} + ${dx}px),0,0)`;

const animation=(element,keyframes,options)=>{
  if(element?.animate)return element.animate(keyframes,{...options,fill:'forwards'});
  const last=keyframes.at(-1)||{};
  if(last.transform!=null)element.style.transform=last.transform;
  return{finished:new Promise(resolve=>setTimeout(resolve,Number(options.duration)||0)),cancel(){}};
};
function attachPreview(state,node,direction,dx){
  if(!node||!state.layer?.isConnected)return;
  if(state.activePreview&&state.activePreview!==node)state.activePreview.remove();
  state.activePreview=node;node.dataset.direction=String(direction);
  if(!node.isConnected)state.layer.insertBefore(node,state.surface);
  const target=adjacentRoute(state.route,direction);
  if(target)preparePreviewScroll(node,target);
  node.style.transform=previewTransform(direction,dx);node.style.opacity='1';
}
function removePreviews(state,keep=null){
  for(const node of state.previews.values())if(node!==keep)node.remove();
  if(state.activePreview&&state.activePreview!==keep)state.activePreview.remove();
}
function releaseCapture(state){
  if(!state?.captured)return;
  try{if(state.page?.hasPointerCapture?.(state.pointerId))state.page.releasePointerCapture(state.pointerId)}catch{}
  state.captured=false;
}
function cancelSettling(){
  const task=settling;if(!task)return false;
  settling=null;
  for(const job of task.jobs||[]){try{job.cancel?.()}catch{}}
  clearSurfaceMotion(task.state.surface);removePreviews(task.state);
  return true;
}
function getPreview(state,direction,dx){
  const target=adjacentRoute(state.route,direction);
  if(!target)return null;
  let node=state.previews.get(direction);
  if(!node&&visualDataReady()){
    node=buildVisualPreview(target,direction);
    if(node){preparePreviewScroll(node,target);state.previews.set(direction,node)}
  }
  if(node)attachPreview(state,node,direction,dx);
  else if(!state.previewPromises.has(direction)){
    state.previewPromises.set(direction,ensureRequiredData().then(()=>{
      if(state.cancelled)return null;
      const built=buildVisualPreview(target,direction);
      if(built){
        preparePreviewScroll(built,target);state.previews.set(direction,built);
        if(swipe===state&&state.axis==='x'&&state.direction===direction)attachPreview(state,built,direction,state.currentDx);
      }
      return built;
    }));
  }
  return node;
}
async function awaitPreview(state,direction,dx){
  const immediate=getPreview(state,direction,dx);
  if(immediate)return immediate;
  const node=await state.previewPromises.get(direction);
  if(node&&!state.cancelled)attachPreview(state,node,direction,dx);
  return node;
}
async function settleBack(state){
  state.cancelled=true;releaseCapture(state);cancelSettling();
  const profile=motionProfile(),surface=state.surface,preview=state.activePreview,direction=Number(preview?.dataset.direction)||state.direction||1;
  surface.classList.remove('is-focus-swiping');surface.classList.add('is-focus-settling');
  const from=getComputedStyle(surface).transform==='none'?'translate3d(0,0,0)':getComputedStyle(surface).transform;
  const jobs=[animation(surface,[{transform:from},{transform:'translate3d(0,0,0)'}],{duration:profile.settle,easing:SETTLE_EASING})];
  if(preview){
    const pfrom=getComputedStyle(preview).transform==='none'?previewTransform(direction,state.currentDx):getComputedStyle(preview).transform;
    jobs.push(animation(preview,[{transform:pfrom},{transform:direction>0?'translate3d(100%,0,0)':'translate3d(-100%,0,0)'}],{duration:profile.settle,easing:SETTLE_EASING}));
  }
  const task={state,jobs};settling=task;
  await Promise.allSettled(jobs.map(job=>job.finished));
  if(settling!==task)return;
  settling=null;clearSurfaceMotion(surface);removePreviews(state);
}
function newState(page,route){
  const prepared=activateLineScroll(page,route)||prepareSurface(page);
  if(!prepared)return null;
  bindSurfaceScroll(prepared.surface,route);
  prepared.surface.style.willChange='transform, opacity';
  return{route,page:prepared.page,layer:prepared.layer,surface:prepared.surface,nav:prepared.nav,currentDx:0,direction:0,activePreview:null,previews:new Map(),previewPromises:new Map(),cancelled:false,captured:false};
}
function begin(event){
  const page=event.target.closest?.('.line-page');
  if(!page||event.pointerType==='mouse'||interactiveSwipeBlock(event.target))return;
  if(transitionActive()||committing||swipe)return;
  cancelSettling();
  const route=readRoute();if(!route)return;
  const state=newState(page,route);if(!state)return;
  Object.assign(state,{pointerId:event.pointerId,originTarget:event.target,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,startTime:event.timeStamp||performance.now(),axis:null,moved:false});
  swipe=state;ensureRequiredData().catch(()=>{});
}
function move(event){
  const state=swipe;if(!state||event.pointerId!==state.pointerId)return;
  const dx=event.clientX-state.startX,dy=event.clientY-state.startY,ax=Math.abs(dx),ay=Math.abs(dy);
  if(!state.axis)state.axis=resolveAxis(ax,ay);
  state.lastX=event.clientX;state.lastY=event.clientY;state.lastTime=event.timeStamp||performance.now();state.currentDx=dx;
  if(state.axis!=='x')return;
  event.stopImmediatePropagation();event.preventDefault();
  if(!state.captured){try{state.page.setPointerCapture?.(event.pointerId);state.captured=!!state.page.hasPointerCapture?.(event.pointerId)}catch{state.captured=false}}
  state.moved=state.moved||ax>=12;if(state.moved)lastTap=null;
  const direction=dx<0?1:-1,target=adjacentRoute(state.route,direction),resisted=target?dx:dx*.28;
  state.direction=direction;state.surface.classList.add('is-focus-swiping');state.surface.style.transform=`translate3d(${resisted}px,0,0)`;state.surface.style.opacity='1';
  if(target)getPreview(state,direction,dx);else{state.activePreview?.remove();state.activePreview=null}
}
function tap(event,state){
  if(interactiveTapBlock(state.originTarget)){lastTap=null;return}
  const rect=state.page.getBoundingClientRect(),direction=event.clientX<rect.left+rect.width/2?-1:1,now=performance.now(),previous=lastTap;
  const doubled=!!previous&&previous.direction===direction&&now-previous.time<=360&&Math.abs(event.clientX-previous.x)<=56&&Math.abs(event.clientY-previous.y)<=56;
  if(!doubled){lastTap={direction,time:now,x:event.clientX,y:event.clientY};return}
  lastTap=null;suppressClickUntil=now+440;buttonNavigate(direction,'doubletap');
}
async function commit(state,direction,origin){
  committing=true;
  try{
    const preview=await awaitPreview(state,direction,state.currentDx||0);
    if(!preview){await settleBack(state);return false}
    removePreviews(state,preview);
    return await runTransition(state,direction,origin,preview);
  }finally{committing=false}
}
function finishGesture(state,{x=state.lastX,y=state.lastY,time=state.lastTime||performance.now(),allowTap=false,tapEvent=null}={}){
  const dx=x-state.startX,dy=y-state.startY,ax=Math.abs(dx),ay=Math.abs(dy),duration=Math.max(1,time-state.startTime);
  const axis=state.axis??resolveAxis(ax,ay);
  if(axis==='y'){lastTap=null;state.cancelled=true;clearSurfaceMotion(state.surface);removePreviews(state);return false}
  if(allowTap&&!axis&&ax<=12&&ay<=12&&duration<=460){state.cancelled=true;clearSurfaceMotion(state.surface);removePreviews(state);tap(tapEvent||{clientX:x,clientY:y},state);return false}
  if(axis==='x'&&(state.moved||ax>=12))suppressClickUntil=performance.now()+360;
  const width=Math.max(320,state.surface.clientWidth||innerWidth||320),threshold=commitThreshold(width),velocity=ax/duration;
  const shouldCommit=axis==='x'&&(ax>=threshold||(ax>=FLICK_MIN_PX&&velocity>=FLICK_VELOCITY)),direction=dx<0?1:-1;
  if(shouldCommit&&adjacentRoute(state.route,direction)){commit(state,direction,'swipe');return true}
  settleBack(state);return false;
}
function end(event){
  const state=swipe;if(!state||event.pointerId!==state.pointerId)return;
  swipe=null;event.stopImmediatePropagation();releaseCapture(state);
  finishGesture(state,{x:event.clientX,y:event.clientY,time:event.timeStamp||performance.now(),allowTap:true,tapEvent:event});
}
function cancel(event){
  const state=swipe;if(!state||event.pointerId!==state.pointerId)return;
  swipe=null;lastTap=null;event.stopImmediatePropagation();releaseCapture(state);
  finishGesture(state,{x:state.lastX,y:state.lastY,time:state.lastTime||performance.now()});
}
function lostCapture(event){
  const state=swipe;if(!state||event.pointerId!==state.pointerId)return;
  swipe=null;lastTap=null;state.captured=false;
  finishGesture(state,{x:state.lastX,y:state.lastY,time:state.lastTime||performance.now()});
}
async function buttonNavigate(direction,origin='button'){
  if(transitionActive()){interruptTransition(direction);return true}
  if(committing)return false;
  cancelSettling();
  const route=readRoute(),page=currentPage();if(!route||!page||!adjacentRoute(route,direction))return false;
  const state=newState(page,route);if(!state)return false;
  state.direction=direction;
  let preview=getPreview(state,direction,0);
  if(!preview){committing=true;try{preview=await awaitPreview(state,direction,0)}finally{committing=false}}
  if(!preview)return false;
  removePreviews(state,preview);
  runTransition(state,direction,origin,preview);
  return true;
}
setRestartHandler(direction=>buttonNavigate(direction,'button'));

document.addEventListener('pointerdown',begin,{passive:true,capture:true});
document.addEventListener('pointermove',move,{passive:false,capture:true});
document.addEventListener('pointerup',end,{passive:true,capture:true});
document.addEventListener('pointercancel',cancel,{passive:true,capture:true});
document.addEventListener('lostpointercapture',lostCapture,{passive:true,capture:true});
document.addEventListener('click',event=>{
  const button=event.target.closest?.('.line-page .floating-nav [data-prev],.line-page .floating-nav [data-next],.line-nav-v2-overlay .floating-nav [data-prev],.line-nav-v2-overlay .floating-nav [data-next]');
  if(button&&!button.disabled){event.preventDefault();event.stopImmediatePropagation();buttonNavigate(button.hasAttribute('data-next')?1:-1);return}
  if(event.target.closest?.('.line-page')&&performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation()}
},{capture:true});
window.addEventListener('blur',()=>{lastTap=null;if(swipe){const state=swipe;swipe=null;releaseCapture(state);settleBack(state)}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){lastTap=null;if(swipe){const state=swipe;swipe=null;releaseCapture(state);settleBack(state)}}});
const scheduleRoleSync=()=>requestAnimationFrame(syncFocusRole);
window.addEventListener('hashchange',()=>{lastTap=null;cancelSettling();scheduleRoleSync();resetFocusScroll();scheduleLineScroll();if(readRoute())ensureRequiredData().catch(()=>{})});
apiReady.then(api=>{scheduleRoleSync();scheduleLineScroll();api.store?.addEventListener?.('ready',()=>{scheduleRoleSync();scheduleLineScroll()})}).catch(()=>{});

window.MTS_LINE_NAVIGATION=Object.freeze({version:2,easing:COMMIT_EASING,navigate:direction=>buttonNavigate(Math.sign(direction)||1,'api'),transitionState,gestureProfile:Object.freeze({axisLockPx:AXIS_LOCK_PX,axisDominance:AXIS_DOMINANCE,commitMinPx:COMMIT_MIN_PX,commitMaxPx:COMMIT_MAX_PX,commitRatio:COMMIT_RATIO,flickMinPx:FLICK_MIN_PX,flickVelocity:FLICK_VELOCITY})});
