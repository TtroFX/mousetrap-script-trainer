const STYLE_ID='mts-gesture-controls-style';
const overlay=document.getElementById('word-overlay');
const sheet=overlay?.querySelector('.word-sheet');

if(!document.getElementById(STYLE_ID)){
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    html,body,#app{overscroll-behavior-y:none}
    .sheet-backdrop{overscroll-behavior:contain;transition:background-color .18s ease}
    .word-sheet{overscroll-behavior:contain;touch-action:pan-y;will-change:transform;transition:transform .18s cubic-bezier(.2,.8,.2,1)}
    .word-sheet.is-dragging{transition:none}
    .word-sheet.is-dismissing{transform:translateY(100%)!important}
    .sheet-backdrop.is-dismissing{background:rgba(20,17,14,0)}
    @media(prefers-reduced-motion:reduce){.word-sheet,.sheet-backdrop{transition:none!important}}
  `;
  document.head.append(style);
}

// Chrome/Android normally respects overscroll-behavior. This is a fallback for
// top-edge touch gestures so an empty/short page cannot trigger pull-to-refresh.
let rootStartY=null;
document.addEventListener('touchstart',event=>{
  if(event.touches.length!==1||event.target.closest?.('.word-sheet')){rootStartY=null;return}
  rootStartY=window.scrollY<=0?event.touches[0].clientY:null;
},{passive:true,capture:true});
document.addEventListener('touchmove',event=>{
  if(rootStartY==null||event.touches.length!==1)return;
  if(window.scrollY<=0&&event.touches[0].clientY>rootStartY+2)event.preventDefault();
},{passive:false,capture:true});
document.addEventListener('touchend',()=>{rootStartY=null},{passive:true,capture:true});
document.addEventListener('touchcancel',()=>{rootStartY=null},{passive:true,capture:true});

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

if(sheet&&overlay){
  let gesture=null;
  const start=(x,y,time=performance.now())=>{gesture={startX:x,startY:y,startTime:time,lastY:y,lastTime:time,preview:false}};
  const move=(x,y,time=performance.now(),event=null)=>{
    if(!gesture)return;
    const dx=x-gesture.startX,dy=y-gesture.startY;
    gesture.lastY=y;gesture.lastTime=time;
    if(dy>0&&Math.abs(dy)>Math.abs(dx)*1.15&&sheet.scrollTop<=1){
      gesture.preview=true;
      event?.preventDefault?.();
      sheet.classList.add('is-dragging');
      sheet.style.transform=`translateY(${Math.min(dy*.82,window.innerHeight)}px)`;
    }
  };
  const end=(x,y,time=performance.now())=>{
    if(!gesture)return false;
    const dx=x-gesture.startX,dy=y-gesture.startY,duration=Math.max(1,time-gesture.startTime);
    const recentDuration=Math.max(1,time-gesture.lastTime),recentDy=y-gesture.lastY;
    const averageVelocity=dy/duration,recentVelocity=recentDy/recentDuration;
    const vertical=dy>0&&Math.abs(dy)>Math.abs(dx)*1.15;
    const dismiss=vertical&&((dy>=70&&Math.max(averageVelocity,recentVelocity)>=.45)||(dy>=140&&duration<=550));
    gesture=null;
    if(dismiss){closeSheet();return true}
    resetSheet();return false;
  };
  const cancel=()=>{gesture=null;resetSheet()};

  sheet.addEventListener('touchstart',event=>{
    if(event.touches.length===1){const t=event.touches[0];start(t.clientX,t.clientY)}
  },{passive:true});
  sheet.addEventListener('touchmove',event=>{
    if(event.touches.length===1){const t=event.touches[0];move(t.clientX,t.clientY,performance.now(),event)}
  },{passive:false});
  sheet.addEventListener('touchend',event=>{
    const t=event.changedTouches[0];if(t)end(t.clientX,t.clientY);
  },{passive:true});
  sheet.addEventListener('touchcancel',cancel,{passive:true});

  // Pointer support covers mouse/pen and gives desktop QA the same behavior.
  sheet.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch')start(event.clientX,event.clientY,event.timeStamp)});
  sheet.addEventListener('pointermove',event=>{if(event.pointerType!=='touch'&&gesture)move(event.clientX,event.clientY,event.timeStamp,event)});
  sheet.addEventListener('pointerup',event=>{if(event.pointerType!=='touch'&&gesture)end(event.clientX,event.clientY,event.timeStamp)});
  sheet.addEventListener('pointercancel',event=>{if(event.pointerType!=='touch')cancel()});

  // Existing close paths can hide the overlay directly; always clear a stale drag transform.
  new MutationObserver(()=>{if(overlay.hidden)resetSheet()}).observe(overlay,{attributes:true,attributeFilter:['hidden']});

  window.MTS_GESTURES=Object.freeze({version:1,closeSheet,resetSheet});
}
