'use strict';
const BUILD_ID='index-zero-2026-08-27-r9';
const SHELL_CACHE=`mts-zero-shell-${BUILD_ID}`;
const DATA_CACHE=`mts-zero-data-${BUILD_ID}`;
const SHELL=[
  './','./index.html','./src/app.css','./src/config.js','./src/data-store.js','./src/state-store.js','./src/resume-bookmarks.js','./src/gesture-controls.js','./src/main.js','./src/study/study.css','./src/study/structure-model.js','./src/study/structure-view.js','./src/study/dictionary-sheet.js',
  './manifest.webmanifest','./offline.html','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png'
];
const DATA_ASSETS=[
  'mousetrap_script_data.json','mousetrap_line_translations.json','mousetrap_line_interpretation.json','mousetrap_line_vocabulary.json',
  'mousetrap_line_grammar.json','mousetrap_word_dictionary.json','mousetrap_line_structure.json'
];
const DATA=new Set(DATA_ASSETS);
const timeoutFetch=(request,ms=7000)=>new Promise((resolve,reject)=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  fetch(request,{signal:controller.signal,cache:'no-store'}).then(resolve,reject).finally(()=>clearTimeout(timer));
});
const relative=request=>{const url=new URL(request.url),scope=new URL(self.registration.scope);if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return null;const path=url.pathname.slice(scope.pathname.length)||'index.html';return path.replace(/^\//,'')};
const scopedUrl=asset=>new URL(String(asset).replace(/^\.\//,''),self.registration.scope).href;
const openCache=cacheName=>caches.open(cacheName);
async function precacheRequired(cacheName,assets){
  const cache=await openCache(cacheName);
  await Promise.all(assets.map(async asset=>{
    const url=scopedUrl(asset);
    const response=await timeoutFetch(new Request(url,{cache:'reload'}),20000);
    if(!response.ok)throw new Error(`PRECACHE_HTTP_${response.status}:${asset}`);
    await cache.put(url,response.clone());
  }));
}
function backgroundPut(cacheName,key,response){Promise.resolve().then(()=>caches.open(cacheName)).then(cache=>cache.put(key,response)).catch(()=>{});}
async function networkFirst(request,cacheName,fallback=''){
  const rel=relative(request);
  const key=rel?scopedUrl(rel):request;
  try{
    const response=await timeoutFetch(request);
    if(response.ok){backgroundPut(cacheName,key,response.clone());return response;}
  }catch{}
  try{
    const cache=await caches.open(cacheName);
    const hit=await cache.match(key);
    if(hit)return hit;
    if(fallback){const fb=await cache.match(scopedUrl(fallback));if(fb)return fb;}
  }catch{}
  return new Response('Offline',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    await Promise.all([
      precacheRequired(SHELL_CACHE,SHELL),
      precacheRequired(DATA_CACHE,DATA_ASSETS)
    ]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith('mts-zero-')&&!name.endsWith(BUILD_ID)).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const rel=relative(event.request);
  if(event.request.mode==='navigate'){event.respondWith(networkFirst(event.request,SHELL_CACHE,'./index.html'));return;}
  if(rel&&DATA.has(rel)){event.respondWith(networkFirst(event.request,DATA_CACHE));return;}
  if(rel&&SHELL.some(asset=>asset.replace(/^\.\//,'')===rel)){event.respondWith(networkFirst(event.request,SHELL_CACHE));}
});
self.addEventListener('message',event=>{
  if(event.data?.type==='GET_VERSION')event.source?.postMessage({type:'MTS_PWA_VERSION',buildId:BUILD_ID});
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
