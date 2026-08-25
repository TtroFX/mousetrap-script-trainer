'use strict';
const BUILD_ID='p6-2026-08-25-r14';
const DATA_VERSION='p5-canonical-recovery-2026-08-25-r2';
const CACHE_PREFIX='mts-pwa-';
const SHELL_CACHE=`${CACHE_PREFIX}shell-${BUILD_ID}`;
const LEGACY_PRIVATE_CACHE='mts-private-production-v1';
const VERSION_PATH='./pwa-version.json';
const OFFLINE_PATH='./offline.html';
const SHELL_ASSETS=[
  './index.html','./p5.css','./p5_app.js','./practice_navigation.js','./reader_sheet.js','./p6_private_data.js','./pages_private_import.js','./p6_pwa.css','./p6_pwa.js',
  './P2_learning.html','./008_cue_practice_P3.html','./009_rehearsal_P4.html','./mousetrap_line_structure.json','./manifest.webmanifest',VERSION_PATH,OFFLINE_PATH,
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png'
];
function noStore(source){const r=typeof source==='string'?new Request(source):source;return new Request(r,{cache:'no-store',credentials:'same-origin'})}
async function openCache(name){try{return await caches.open(name)}catch{return null}}
async function precacheShell(){
  const cache=await openCache(SHELL_CACHE);if(!cache)throw Error('CACHE_UNAVAILABLE');
  const entries=await Promise.all(SHELL_ASSETS.map(async asset=>{const response=await fetch(noStore(asset));if(!response.ok)throw Error(`SHELL_ASSET_${response.status}:${asset}`);return[asset,response]}));
  await Promise.all(entries.map(([asset,response])=>cache.put(asset,response)));
}
self.addEventListener('install',event=>event.waitUntil((async()=>{try{await precacheShell();await self.skipWaiting()}catch(error){await caches.delete(SHELL_CACHE).catch(()=>{});throw error}})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const names=await caches.keys().catch(()=>[]);
  await Promise.all(names.map(name=>{
    if(name===LEGACY_PRIVATE_CACHE)return caches.delete(name);
    if(name.startsWith(`${CACHE_PREFIX}shell-`)&&name!==SHELL_CACHE)return caches.delete(name);
    return false;
  }));
  await self.clients.claim();
})()));
function relative(url){const scope=new URL(self.registration.scope);if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return null;let rel=url.pathname.slice(scope.pathname.length);if(!rel||rel==='/')rel='index.html';return `./${rel}`}
async function shell(request){const cache=await openCache(SHELL_CACHE),rel=relative(new URL(request.url));if(cache&&rel){const hit=await cache.match(rel);if(hit)return hit}try{const response=await fetch(noStore(request));if(response.ok)return response}catch{}if(cache){const fallback=await cache.match(OFFLINE_PATH);if(fallback)return fallback}return new Response('Offline',{status:503})}
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;const rel=relative(url);if(event.request.mode==='navigate'){event.respondWith(shell(event.request));return}if(rel&&SHELL_ASSETS.includes(rel))event.respondWith(shell(event.request))});
self.addEventListener('message',event=>{const m=event.data||{};if(m.type==='SKIP_WAITING'){self.skipWaiting();return}if(m.type==='GET_VERSION'&&event.source)event.source.postMessage({type:'MTS_PWA_VERSION',buildId:BUILD_ID,dataVersion:DATA_VERSION})});
