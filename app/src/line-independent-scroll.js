import { readRoute, routeHash, currentPage, prepareSurface } from './line-page-runtime.js';

const scrollMemory=new Map();
const MAX_SCROLL_ROUTES=48;
let scheduled=false;

const keyFor=route=>route?routeHash(route):'';
const normalizeTop=value=>Math.max(0,Number(value)||0);
const remember=(key,value)=>{
  if(!key)return;
  const top=normalizeTop(value);
  if(scrollMemory.has(key))scrollMemory.delete(key);
  scrollMemory.set(key,top);
  while(scrollMemory.size>MAX_SCROLL_ROUTES)scrollMemory.delete(scrollMemory.keys().next().value);
};

export function rememberedScrollTop(route){
  return scrollMemory.get(keyFor(route))||0;
}

export function setRouteScrollTop(route,value=0,surface=null){
  const key=keyFor(route);
  if(!key)return 0;
  const top=normalizeTop(value);
  remember(key,top);
  if(surface&&surface.dataset?.lineScrollKey===key&&Math.abs(surface.scrollTop-top)>1)surface.scrollTop=top;
  return top;
}

export function resetRouteScroll(route,surface=null){
  return setRouteScrollTop(route,0,surface);
}

export function bindSurfaceScroll(surface,route=readRoute()){
  if(!surface||!route)return surface;
  const key=keyFor(route);
  surface.dataset.lineScrollKey=key;
  if(surface.dataset.lineScrollBound!=='true'){
    surface.dataset.lineScrollBound='true';
    surface.addEventListener('scroll',()=>remember(surface.dataset.lineScrollKey,surface.scrollTop),{passive:true});
  }
  const top=rememberedScrollTop(route);
  if(Math.abs(surface.scrollTop-top)>1)surface.scrollTop=top;
  return surface;
}

export function preparePreviewScroll(preview,route,topOverride=null){
  if(!preview||!route)return preview;
  const key=keyFor(route),top=topOverride==null?rememberedScrollTop(route):normalizeTop(topOverride);
  preview.dataset.lineScrollKey=key;
  if(Math.abs(preview.scrollTop-top)>1)preview.scrollTop=top;
  return preview;
}

export function syncLineViewport(page=currentPage()){
  if(!page)return 0;
  const top=Math.max(0,page.getBoundingClientRect().top);
  const bottomNav=document.querySelector('.bottom-nav');
  const bottom=Math.min(innerHeight,bottomNav?.getBoundingClientRect?.().top??innerHeight);
  const height=Math.max(220,Math.floor(bottom-top));
  page.style.setProperty('--line-page-viewport-height',`${height}px`);
  return height;
}

export function activateLineScroll(page=currentPage(),route=readRoute()){
  if(!page||!route)return null;
  const prepared=prepareSurface(page);
  if(!prepared)return null;
  syncLineViewport(page);
  bindSurfaceScroll(prepared.surface,route);
  return prepared;
}

export function scheduleLineScroll(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{
    scheduled=false;
    const route=readRoute();
    if(route)activateLineScroll(currentPage(),route);
  });
}

const app=document.getElementById('app');
if(app){
  const observer=new MutationObserver(scheduleLineScroll);
  observer.observe(app,{childList:true,subtree:true});
}
window.addEventListener('hashchange',scheduleLineScroll);
window.addEventListener('resize',scheduleLineScroll,{passive:true});
window.addEventListener('orientationchange',scheduleLineScroll,{passive:true});
window.visualViewport?.addEventListener?.('resize',scheduleLineScroll,{passive:true});
requestAnimationFrame(scheduleLineScroll);

window.MTS_LINE_SCROLL=Object.freeze({
  version:1,
  activate:scheduleLineScroll,
  get:route=>rememberedScrollTop(route),
  set:(route,value)=>setRouteScrollTop(route,value),
  reset:route=>resetRouteScroll(route),
});
