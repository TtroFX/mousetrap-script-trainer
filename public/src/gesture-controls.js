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

  window.MTS_GESTURES=Object.freeze({version:1,closeSheet,resetSheet});
}
