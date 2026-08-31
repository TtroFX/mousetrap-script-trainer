const FOCUS_COMMIT_EASING='cubic-bezier(0.2, 0.78, 0.2, 1)';
const focusCommitDuration=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?110:205;
let activeHandoff=null;

const emitHandoff=(phase,extra={})=>{
  window.dispatchEvent(new CustomEvent('mts:focus-swipe-handoff',{detail:{phase,...extra}}));
};
const sanitizeClone=clone=>{
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
  clone.querySelectorAll('button,a,input,select,textarea,[tabindex]').forEach(node=>node.setAttribute('tabindex','-1'));
  clone.setAttribute('aria-hidden','true');
  clone.style.pointerEvents='none';
};
const placeClone=(source,className,zIndex)=>{
  const rect=source.getBoundingClientRect(),computed=getComputedStyle(source),clone=source.cloneNode(true);
  sanitizeClone(clone);
  clone.classList.remove('line-page-surface','focus-page-preview','is-focus-swiping','is-focus-settling','is-focus-entering');
  clone.classList.add(className);
  Object.assign(clone.style,{
    position:'absolute',
    left:`${rect.left}px`,
    top:`${rect.top}px`,
    width:`${rect.width}px`,
    height:`${rect.height}px`,
    margin:'0',
    transform:'translate3d(0,0,0)',
    opacity:computed.opacity||'1',
    background:computed.backgroundColor,
    boxSizing:'border-box',
    willChange:'transform, opacity',
    zIndex:String(zIndex),
    pointerEvents:'none'
  });
  return{clone,rect,opacity:Number.parseFloat(computed.opacity)||1};
};
const clearHandoff=(reason='cleanup')=>{
  const state=activeHandoff;
  if(!state)return;
  activeHandoff=null;
  try{state.outgoingAnimation?.cancel?.()}catch{}
  try{state.incomingAnimation?.cancel?.()}catch{}
  state.layer?.remove();
  emitHandoff('cleanup',{id:state.id,direction:state.direction,reason});
};
const captureHandoff=detail=>{
  const page=document.querySelector('.line-page');
  const layer=page?.querySelector(':scope > .line-page-motion-layer');
  const surface=layer?.querySelector(':scope > .line-page-surface.is-focus-swiping');
  const preview=layer?.querySelector(':scope > .focus-page-preview');
  if(!page||!layer||!surface||!preview||Number(preview.dataset.direction)!==Number(detail.direction))return;
  clearHandoff('replaced');
  const layerRect=layer.getBoundingClientRect();
  const outgoing=placeClone(surface,'focus-swipe-exit-surface',2);
  const incoming=placeClone(preview,'focus-swipe-preview-surface',1);
  const visualLayer=document.createElement('div');
  visualLayer.className='focus-swipe-handoff-layer';
  visualLayer.dataset.transitionId=String(detail.id);
  visualLayer.setAttribute('aria-hidden','true');
  Object.assign(visualLayer.style,{
    position:'fixed',inset:'0',overflow:'hidden',pointerEvents:'none',zIndex:'3',contain:'layout style paint'
  });
  visualLayer.append(incoming.clone,outgoing.clone);
  document.body.appendChild(visualLayer);
  activeHandoff={
    id:detail.id,direction:Number(detail.direction)||1,layer:visualLayer,layerRect,
    outgoing:outgoing.clone,outgoingRect:outgoing.rect,outgoingOpacity:outgoing.opacity,
    incoming:incoming.clone,incomingRect:incoming.rect,incomingOpacity:incoming.opacity,
    duration:focusCommitDuration(),outgoingAnimation:null,incomingAnimation:null
  };
  emitHandoff('captured',{
    id:detail.id,direction:activeHandoff.direction,
    oldText:outgoing.clone.querySelector('.line-detail-text')?.textContent||'',
    previewText:incoming.clone.querySelector('.line-detail-text')?.textContent||''
  });
};
const startHandoff=detail=>{
  const state=activeHandoff;
  if(!state||state.id!==detail.id)return;
  const exitDistance=state.direction>0?-(state.outgoingRect.right+16):(innerWidth-state.outgoingRect.left+16);
  const previewDistance=state.layerRect.left-state.incomingRect.left;
  const timing={duration:state.duration,easing:FOCUS_COMMIT_EASING,fill:'forwards'};
  state.outgoingAnimation=state.outgoing.animate([
    {transform:'translate3d(0,0,0)',opacity:state.outgoingOpacity},
    {transform:`translate3d(${exitDistance}px,0,0)`,opacity:Math.min(state.outgoingOpacity,.98)}
  ],timing);
  state.incomingAnimation=state.incoming.animate([
    {transform:'translate3d(0,0,0)',opacity:state.incomingOpacity},
    {transform:`translate3d(${previewDistance}px,0,0)`,opacity:1}
  ],timing);
  Promise.allSettled([state.outgoingAnimation.finished,state.incomingAnimation.finished]).then(()=>{
    if(activeHandoff===state)emitHandoff('finish',{id:state.id,direction:state.direction});
  });
  emitHandoff('start',{
    id:state.id,direction:state.direction,duration:state.duration,easing:FOCUS_COMMIT_EASING,
    oldText:state.outgoing.querySelector('.line-detail-text')?.textContent||'',
    previewText:state.incoming.querySelector('.line-detail-text')?.textContent||''
  });
};

window.addEventListener('mts:focus-transition',event=>{
  const detail=event.detail||{};
  if(detail.phase==='preload')captureHandoff(detail);
  else if(detail.phase==='animationstart')startHandoff(detail);
  else if(detail.phase==='complete'&&activeHandoff?.id===detail.id)requestAnimationFrame(()=>clearHandoff('complete'));
  else if((detail.phase==='interrupted'||detail.phase==='failed')&&activeHandoff?.id===detail.id)clearHandoff(detail.phase);
});
window.addEventListener('pagehide',()=>clearHandoff('pagehide'));
window.MTS_FOCUS_SWIPE_HANDOFF=Object.freeze({
  version:1,
  easing:FOCUS_COMMIT_EASING,
  state:()=>activeHandoff?{id:activeHandoff.id,direction:activeHandoff.direction,duration:activeHandoff.duration}:null
});
