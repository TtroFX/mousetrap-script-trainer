import {
  COMMIT_EASING,SETTLE_EASING,motionProfile,apiReady,ensureRequiredData,visualDataReady,
  readRoute,adjacentRoute,buildVisualPreview,currentPage,prepareSurface,clearSurfaceMotion,
  syncFocusRole,resetFocusScroll
} from './line-page-runtime.js';
import {transitionActive,transitionState,setRestartHandler,interruptTransition,runTransition} from './line-transition-engine.js';

const navStyle=document.createElement('style');
navStyle.textContent='.line-nav-v2-overlay .floating-nav{pointer-events:auto!important}.line-nav-v2-overlay .floating-nav>button{pointer-events:auto!important}';
document.head.append(navStyle);

let swipe=null,lastTap=null,suppressClickUntil=0,committing=false;
const interactiveSwipeBlock=target=>!!target.closest?.('input,select,textarea,[contenteditable="true"],[data-no-page-swipe]');
const interactiveTapBlock=target=>!!target.closest?.('button,a,summary,input,select,textarea,[role="button"],[contenteditable="true"],[data-no-page-doubletap]');
const previewTransform=(direction,dx)=>`translate3d(calc(${direction>0?'100%':'-100%'} + ${dx}px),0,0)`;

const animation=(element,keyframes,options)=>{
  if(element?.animate)return element.animate(keyframes,{...options,fill:'forwards'});
  const last=keyframes.at(-1)||{};
  if(last.transform!=null)element.style.transform=last.transform;
  return{finished:new Promise(resolve=>setTimeout(resolve,Number(options.duration)||0))};
};
function attachPreview(state,node,direction,dx){
  if(!node||!state.layer?.isConnected)return;
  if(state.activePreview&&state.activePreview!==node)state.activePreview.remove();
  state.activePreview=node;node.dataset.direction=String(direction);
  if(!node.isConnected)state.layer.insertBefore(node,state.surface);
  node.style.transform=previewTransform(direction,dx);node.style.opacity='1';
}
function removePreviews(state,keep=null){
  for(const node of state.previews.values())if(node!==keep)node.remove();
  if(state.activePreview&&state.activePreview!==keep)state.activePreview.remove();
}
function getPreview(state,direction,dx){
  const target=adjacentRoute(state.route,direction);
  if(!target)return null;
  let node=state.previews.get(direction);
  if(!node&&visualDataReady()){node=buildVisualPreview(target,direction);if(node)state.previews.set(direction,node)}
  if(node)attachPreview(state,node,direction,dx);
  else if(!state.previewPromises.has(direction)){
    state.previewPromises.set(direction,ensureRequiredData().then(()=>{
      if(state.cancelled)return null;
      const built=buildVisualPreview(target,direction);
      if(built){state.previews.set(direction,built);if(swipe===state&&state.axis==='x'&&state.direction===direction)attachPreview(state,built,direction,state.currentDx)}
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
  state.cancelled=true;
  const profile=motionProfile(),surface=state.surface,preview=state.activePreview,direction=Number(preview?.dataset.direction)||state.direction||1;
  surface.classList.remove('is-focus-swiping');surface.classList.add('is-focus-settling');
  const from=getComputedStyle(surface).transform==='none'?'translate3d(0,0,0)':getComputedStyle(surface).transform;
  const jobs=[animation(surface,[{transform:from},{transform:'translate3d(0,0,0)'}],{duration:profile.settle,easing:SETTLE_EASING})];
  if(preview){
    const pfrom=getComputedStyle(preview).transform==='none'?previewTransform(direction,state.currentDx):getComputedStyle(preview).transform;
    jobs.push(animation(preview,[{transform:pfrom},{transform:direction>0?'translate3d(100%,0,0)':'translate3d(-100%,0,0)'}],{duration:profile.settle,easing:SETTLE_EASING}));
  }
  await Promise.allSettled(jobs.map(job=>job.finished));
  clearSurfaceMotion(surface);removePreviews(state);
}
function newState(page,route){
  const prepared=prepareSurface(page);
  if(!prepared)return null;
  prepared.surface.style.willChange='transform, opacity';
  return{route,page:prepared.page,layer:prepared.layer,surface:prepared.surface,nav:prepared.nav,currentDx:0,direction:0,activePreview:null,previews:new Map(),previewPromises:new Map(),cancelled:false};
}
function begin(event){
  const page=event.target.closest?.('.line-page');
  if(!page||event.pointerType==='mouse'||interactiveSwipeBlock(event.target))return;
  event.stopImmediatePropagation();
  if(transitionActive()||committing||swipe)return;
  const route=readRoute();if(!route)return;
  const state=newState(page,route);if(!state)return;
  Object.assign(state,{pointerId:event.pointerId,originTarget:event.target,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,startTime:event.timeStamp||performance.now(),axis:null,moved:false});
  swipe=state;ensureRequiredData().catch(()=>{});
  try{page.setPointerCapture?.(event.pointerId)}catch{}
}
function move(event){
  const state=swipe;if(!state||event.pointerId!==state.pointerId)return;
  event.stopImmediatePropagation();
  const dx=event.clientX-state.startX,dy=event.clientY-state.startY,ax=Math.abs(dx),ay=Math.abs(dy);
  if(!state.axis&&Math.max(ax,ay)>=10){if(ax>ay*1.08)state.axis='x';else if(ay>ax*1.08)state.axis='y'}
  state.lastX=event.clientX;state.lastY=event.clientY;state.currentDx=dx;
  if(state.axis!=='x')return;
  event.preventDefault();state.moved=state.moved||ax>=14;if(state.moved)lastTap=null;
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
function end(event){
  const state=swipe;if(!state||event.pointerId!==state.pointerId)return;
  event.stopImmediatePropagation();swipe=null;
  const dx=event.clientX-state.startX,dy=event.clientY-state.startY,ax=Math.abs(dx),ay=Math.abs(dy),duration=Math.max(1,(event.timeStamp||performance.now())-state.startTime);
  const axis=state.axis??(Math.max(ax,ay)>=10?(ax>ay*1.08?'x':ay>ax*1.08?'y':null):null);
  if(!axis&&ax<=12&&ay<=12&&duration<=460){clearSurfaceMotion(state.surface);removePreviews(state);tap(event,state);return}
  if(axis==='y'){lastTap=null;clearSurfaceMotion(state.surface);removePreviews(state);return}
  if(axis==='x'&&(state.moved||ax>=14))suppressClickUntil=performance.now()+360;
  const width=Math.max(320,state.surface.clientWidth||innerWidth||320),threshold=Math.min(88,Math.max(46,width*.14)),velocity=ax/duration;
  const shouldCommit=axis==='x'&&ax>ay*1.05&&(ax>=threshold||(ax>=30&&velocity>=.48)),direction=dx<0?1:-1;
  if(shouldCommit&&adjacentRoute(state.route,direction)){commit(state,direction,'swipe');return}
  settleBack(state);
}
function cancel(event){
  if(!swipe||event.pointerId!==swipe.pointerId)return;
  event.stopImmediatePropagation();const state=swipe;swipe=null;lastTap=null;settleBack(state);
}
async function buttonNavigate(direction,origin='button'){
  if(transitionActive()){interruptTransition(direction);return true}
  if(committing)return false;
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
document.addEventListener('click',event=>{
  const button=event.target.closest?.('.line-page .floating-nav [data-prev],.line-page .floating-nav [data-next],.line-nav-v2-overlay .floating-nav [data-prev],.line-nav-v2-overlay .floating-nav [data-next]');
  if(button&&!button.disabled){event.preventDefault();event.stopImmediatePropagation();buttonNavigate(button.hasAttribute('data-next')?1:-1);return}
  if(event.target.closest?.('.line-page')&&performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation()}
},{capture:true});
window.addEventListener('blur',()=>{lastTap=null;if(swipe){const state=swipe;swipe=null;settleBack(state)}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){lastTap=null;if(swipe){const state=swipe;swipe=null;settleBack(state)}}});
const scheduleRoleSync=()=>requestAnimationFrame(syncFocusRole);
window.addEventListener('hashchange',()=>{lastTap=null;scheduleRoleSync();resetFocusScroll();if(readRoute())ensureRequiredData().catch(()=>{})});
apiReady.then(api=>{scheduleRoleSync();api.store?.addEventListener?.('ready',scheduleRoleSync)}).catch(()=>{});

window.MTS_LINE_NAVIGATION=Object.freeze({version:2,easing:COMMIT_EASING,navigate:direction=>buttonNavigate(Math.sign(direction)||1,'api'),transitionState});
