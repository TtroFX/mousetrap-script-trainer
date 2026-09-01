import {
  PENDING_CLASS,motionProfile,nextFrame,twoFrames,routeHash,adjacentRoute,
  prepareSurface,clearSurfaceMotion,actualPageReady,resetFocusScroll
} from './line-page-runtime.js';
import {bindSurfaceScroll,resetRouteScroll} from './line-independent-scroll.js';

const MOTION_MODEL='velocity-continuous-in-out-v1';
const MOTION_X1=.3;
const MOTION_X2=.7;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const continuityEasing=(distance,velocity,duration)=>{
  const d=Number(distance)||0,t=Math.max(1,Number(duration)||1);
  let slope=Math.abs(d)<.5?0:(Number(velocity)||0)*t/d;
  slope=clamp(slope,-1.6,2.45);
  const y1=Number((MOTION_X1*slope).toFixed(3));
  return`cubic-bezier(${MOTION_X1},${y1},${MOTION_X2},1)`;
};
const completionDuration=(distance,width,velocity,base)=>{
  const d=Math.max(1,Math.abs(Number(distance)||0)),w=Math.max(1,Math.abs(Number(width)||1)),speed=Math.abs(Number(velocity)||0);
  const fraction=clamp(d/w,.04,1.15);
  let duration=base*(.62+.38*Math.sqrt(fraction));
  if(speed>.01)duration=Math.min(duration,Math.max(72,2.35*d/speed));
  return Math.round(clamp(duration,72,base+24));
};

let active=null,id=0,restartHandler=()=>{};
export const transitionActive=()=>!!active;
export const transitionState=()=>active?{id:active.id,phase:active.phase,direction:active.direction,source:{...active.source},target:{...active.target},motion:active.motion?{...active.motion}:null}:null;
export const setRestartHandler=handler=>{restartHandler=typeof handler==='function'?handler:()=>{}};

const emit=(phase,t,extra={})=>{
  const detail={phase,id:t.id,direction:t.direction,scene:t.target.scene,line:t.target.line,route:phase==='preload'?location.hash:routeHash(t.target),...extra};
  window.dispatchEvent(new CustomEvent('mts:focus-transition',{detail}));
};
const animate=(element,keyframes,options)=>{
  if(element?.animate)return element.animate(keyframes,{...options,fill:'forwards'});
  const last=keyframes.at(-1)||{};
  if(last.transform!=null)element.style.transform=last.transform;
  if(last.opacity!=null)element.style.opacity=String(last.opacity);
  return{finished:new Promise(resolve=>setTimeout(resolve,Number(options.duration)||0)),cancel(){}};
};
const fixedize=(element,rect,z)=>{
  Object.assign(element.style,{position:'absolute',inset:'auto',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,margin:'0',right:'auto',bottom:'auto',transform:'none',opacity:'1',willChange:'transform, opacity',zIndex:String(z)});
};
function makeOverlay(state,preview){
  const layerRect=state.layer.getBoundingClientRect(),outgoingRect=state.surface.getBoundingClientRect(),incomingRect=preview.getBoundingClientRect(),navRect=state.nav?.getBoundingClientRect?.()||null;
  const element=document.createElement('div');element.className='line-nav-v2-overlay';element.setAttribute('aria-hidden','true');
  fixedize(preview,incomingRect,1);fixedize(state.surface,outgoingRect,2);
  preview.style.pointerEvents='none';state.surface.style.pointerEvents='none';
  state.surface.classList.remove('is-focus-swiping');state.surface.classList.add('is-focus-settling');
  element.append(preview,state.surface);
  if(state.nav&&navRect){fixedize(state.nav,navRect,3);state.nav.style.willChange='';state.nav.style.pointerEvents='auto';element.append(state.nav)}
  document.body.append(element);
  return{element,outgoing:state.surface,incoming:preview,nav:state.nav,layerRect,outgoingRect,incomingRect};
}
function startMotion(t,state,direction){
  const profile=motionProfile(),out=t.overlay.outgoingRect,inc=t.overlay.incomingRect,base=t.overlay.layerRect;
  const exitX=direction>0?-(out.right+16):(innerWidth-out.left+16),enterX=base.left-inc.left,enterY=base.top-inc.top;
  const releaseVelocityX=Number(state.releaseVelocityX)||0,duration=completionDuration(enterX,base.width||innerWidth,releaseVelocityX,profile.commit);
  const easing=continuityEasing(enterX,releaseVelocityX,duration),timing={duration,easing};
  t.motion={model:MOTION_MODEL,duration,easing,releaseVelocityX,enterX,enterY,exitX,startedAt:performance.now()};
  t.animations=[
    animate(t.overlay.outgoing,[{transform:'translate3d(0,0,0)',opacity:1},{transform:`translate3d(${exitX}px,0,0)`,opacity:1}],timing),
    animate(t.overlay.incoming,[{transform:'translate3d(0,0,0)',opacity:1},{transform:`translate3d(${enterX}px,${enterY}px,0)`,opacity:1}],timing)
  ];
  t.motionFinished=Promise.allSettled(t.animations.map(animation=>animation.finished));
}
function holdActualNav(page){
  const nav=page?.querySelector(':scope > .floating-nav');
  if(!nav)return null;
  for(const button of nav.querySelectorAll('[data-prev],[data-next]')){
    if(button.hasAttribute('data-prev')){button.dataset.lineNavHeld='prev';button.removeAttribute('data-prev')}
    else if(button.hasAttribute('data-next')){button.dataset.lineNavHeld='next';button.removeAttribute('data-next')}
  }
  nav.dataset.lineNavHeld='true';
  return nav;
}
function releaseActualNav(nav){
  if(!nav)return;
  for(const button of nav.querySelectorAll('[data-line-nav-held]')){
    if(button.dataset.lineNavHeld==='prev')button.setAttribute('data-prev','');
    if(button.dataset.lineNavHeld==='next')button.setAttribute('data-next','');
    delete button.dataset.lineNavHeld;
  }
  delete nav.dataset.lineNavHeld;
}
async function waitReady(t){
  const deadline=performance.now()+15000;
  while(active===t&&performance.now()<deadline){
    const ready=actualPageReady(t.target);
    if(ready){await twoFrames();const again=actualPageReady(t.target);if(again)return again}
    await nextFrame();
  }
  return null;
}
const cleanup=t=>{try{t.overlay?.element?.remove()}catch{}t.overlay=null};
function cancelMotion(t){for(const animation of t.animations||[]){try{animation.cancel()}catch{}}}
function finishInterrupted(t){
  if(active!==t)return;
  cancelMotion(t);
  releaseActualNav(t.heldNav);t.heldNav=null;
  document.documentElement.classList.remove(PENDING_CLASS);
  cleanup(t);
  if(t.ready?.surface)clearSurfaceMotion(t.ready.surface);
  active=null;
  const next=t.nextDirection;
  if(next)requestAnimationFrame(()=>restartHandler(next));
}
export function interruptTransition(direction){
  if(!active)return false;
  active.interrupted=true;active.nextDirection=direction;
  if(!active.interruptedEmitted){active.interruptedEmitted=true;emit('interrupted',active,{surfaceLine:active.target.line})}
  if(active.ready)finishInterrupted(active);
  return true;
}
export async function runTransition(state,direction,origin,preview){
  if(active)return false;
  const target=adjacentRoute(state.route,direction);
  if(!target||!preview)return false;
  const t={id:++id,direction,source:state.route,target,origin,phase:'preparing',overlay:null,heldNav:null,ready:null,animations:[],motion:null,motionFinished:null,interrupted:false,nextDirection:0,interruptedEmitted:false};
  active=t;emit('preload',t);
  t.overlay=makeOverlay(state,preview);
  startMotion(t,state,direction);
  t.phase='routing';
  document.documentElement.classList.add(PENDING_CLASS);
  location.hash=routeHash(target);
  emit('route',t);
  resetFocusScroll();
  const ready=await waitReady(t);
  if(active!==t)return false;
  if(!ready){cancelMotion(t);document.documentElement.classList.remove(PENDING_CLASS);cleanup(t);active=null;emit('failed',t);return false}
  const prepared=prepareSurface(ready.page);
  if(!prepared){cancelMotion(t);document.documentElement.classList.remove(PENDING_CLASS);cleanup(t);active=null;emit('failed',t);return false}
  ready.surface=prepared.surface;ready.page.dataset.focusDestinationLine=target.line;ready.surface.dataset.focusLoadedTransition=String(t.id);
  t.ready=ready;t.heldNav=holdActualNav(ready.page);t.phase='loaded';emit('loaded',t,{surfaceLine:target.line});
  if(t.interrupted){finishInterrupted(t);return true}
  const elapsed=Math.max(0,performance.now()-(t.motion?.startedAt||performance.now()));
  t.phase='animating';emit('animationstart',t,{surfaceLine:target.line,duration:t.motion.duration,easing:t.motion.easing,motionModel:MOTION_MODEL,releaseVelocityX:t.motion.releaseVelocityX,elapsed});
  await t.motionFinished;
  if(active!==t)return true;
  if(t.interrupted){finishInterrupted(t);return true}
  if(t.origin==='swipe'){
    resetRouteScroll(target);
    bindSurfaceScroll(ready.surface,target);
  }
  releaseActualNav(t.heldNav);t.heldNav=null;
  document.documentElement.classList.remove(PENDING_CLASS);
  clearSurfaceMotion(ready.surface);cleanup(t);active=null;t.phase='complete';
  emit('complete',t,{surfaceLine:target.line,motionModel:MOTION_MODEL});
  return true;
}
