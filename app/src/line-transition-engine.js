import {
  PENDING_CLASS,COMMIT_EASING,motionProfile,nextFrame,twoFrames,routeHash,adjacentRoute,
  prepareSurface,clearSurfaceMotion,actualPageReady,resetFocusScroll
} from './line-page-runtime.js';

let active=null,id=0,restartHandler=()=>{};
export const transitionActive=()=>!!active;
export const transitionState=()=>active?{id:active.id,phase:active.phase,direction:active.direction,source:{...active.source},target:{...active.target}}:null;
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
function finishInterrupted(t){
  if(active!==t)return;
  for(const animation of t.animations||[]){try{animation.cancel()}catch{}}
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
  const t={id:++id,direction,source:state.route,target,origin,phase:'preparing',overlay:null,heldNav:null,ready:null,animations:[],interrupted:false,nextDirection:0,interruptedEmitted:false};
  active=t;emit('preload',t);
  await nextFrame();
  if(active!==t)return false;
  t.overlay=makeOverlay(state,preview);
  t.phase='routing';
  document.documentElement.classList.add(PENDING_CLASS);
  location.hash=routeHash(target);
  emit('route',t);
  resetFocusScroll();
  const ready=await waitReady(t);
  if(active!==t)return false;
  if(!ready){document.documentElement.classList.remove(PENDING_CLASS);cleanup(t);active=null;emit('failed',t);return false}
  const prepared=prepareSurface(ready.page);
  if(!prepared){document.documentElement.classList.remove(PENDING_CLASS);cleanup(t);active=null;emit('failed',t);return false}
  ready.surface=prepared.surface;ready.page.dataset.focusDestinationLine=target.line;ready.surface.dataset.focusLoadedTransition=String(t.id);
  t.ready=ready;t.heldNav=holdActualNav(ready.page);t.phase='loaded';emit('loaded',t,{surfaceLine:target.line});
  if(t.interrupted){finishInterrupted(t);return true}
  const profile=motionProfile(),actualRect=ready.surface.getBoundingClientRect(),out=t.overlay.outgoingRect,inc=t.overlay.incomingRect;
  const exitX=direction>0?-(out.right+16):(innerWidth-out.left+16),enterX=actualRect.left-inc.left,enterY=actualRect.top-inc.top;
  const timing={duration:profile.commit,easing:COMMIT_EASING};
  t.phase='animating';emit('animationstart',t,{surfaceLine:target.line,duration:profile.commit,easing:COMMIT_EASING});
  t.animations=[
    animate(t.overlay.outgoing,[{transform:'translate3d(0,0,0)',opacity:1},{transform:`translate3d(${exitX}px,0,0)`,opacity:1}],timing),
    animate(t.overlay.incoming,[{transform:'translate3d(0,0,0)',opacity:1},{transform:`translate3d(${enterX}px,${enterY}px,0)`,opacity:1}],timing)
  ];
  await Promise.allSettled(t.animations.map(animation=>animation.finished));
  if(active!==t)return true;
  if(t.interrupted){finishInterrupted(t);return true}
  releaseActualNav(t.heldNav);t.heldNav=null;
  document.documentElement.classList.remove(PENDING_CLASS);
  clearSurfaceMotion(ready.surface);cleanup(t);active=null;t.phase='complete';
  emit('complete',t,{surfaceLine:target.line});
  return true;
}
