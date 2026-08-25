'use strict';
const BUILD_ID='p6-2026-08-25-r18';
const CACHE_PREFIX='mts-pwa-';
const SHELL_CACHE=`${CACHE_PREFIX}shell-${BUILD_ID}`;
const RUNTIME_CACHE=`${CACHE_PREFIX}runtime-${BUILD_ID}`;
const OFFLINE_PATH='./offline.html';
const SHELL_ASSETS=[
  './index.html','./p5.css','./p5_app.js','./practice_navigation.js','./reader_sheet.js','./p6_pwa.css','./p6_pwa.js',
  './P2_learning.html','./008_cue_practice_P3.html','./009_rehearsal_P4.html','./upgrade-r18.html','./manifest.webmanifest','./pwa-version.json',OFFLINE_PATH,
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png'
];
const RUNTIME_ASSETS=new Set([
  './mousetrap_script_data.json','./mousetrap_line_translations.json','./mousetrap_line_vocabulary.json','./mousetrap_line_grammar.json','./mousetrap_word_dictionary.json','./mousetrap_line_structure.json'
]);
function relative(url){const scope=new URL(self.registration.scope);if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return null;let rel=url.pathname.slice(scope.pathname.length);if(!rel||rel==='/')rel='index.html';return `./${rel}`}
async function precacheShell(){const cache=await caches.open(SHELL_CACHE);const entries=await Promise.all(SHELL_ASSETS.map(async asset=>{const response=await fetch(asset,{cache:'reload'});if(!response.ok)throw Error(`SHELL_ASSET_${response.status}:${asset}`);return[asset,response]}));await Promise.all(entries.map(([asset,response])=>cache.put(asset,response)))}
self.addEventListener('install',event=>event.waitUntil((async()=>{try{await precacheShell();await self.skipWaiting()}catch(error){await caches.delete(SHELL_CACHE).catch(()=>{});throw error}})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const names=await caches.keys().catch(()=>[]);await Promise.all(names.map(name=>{if(name.startsWith(`${CACHE_PREFIX}shell-`)&&name!==SHELL_CACHE)return caches.delete(name);if(name.startsWith(`${CACHE_PREFIX}runtime-`)&&name!==RUNTIME_CACHE)return caches.delete(name);if(name.startsWith(`${CACHE_PREFIX}data-`)||name==='mts-private-production-v1')return caches.delete(name);return false}));await self.clients.claim()})()));
async function networkFirst(request,event,cacheName,fallbackPath=''){const cache=await caches.open(cacheName);const rel=relative(new URL(request.url));try{const response=await fetch(request,{cache:'no-store'});if(response.ok){const key=rel||request;event.waitUntil(cache.put(key,response.clone()).catch(()=>{}));return response}}catch{}if(rel){const hit=await cache.match(rel);if(hit)return hit}else{const hit=await cache.match(request);if(hit)return hit}if(fallbackPath){const fallback=await cache.match(fallbackPath);if(fallback)return fallback}return new Response('Offline',{status:503})}
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;const rel=relative(url);if(event.request.mode==='navigate'){event.respondWith(networkFirst(event.request,event,SHELL_CACHE,OFFLINE_PATH));return}if(rel&&RUNTIME_ASSETS.has(rel)){event.respondWith(networkFirst(event.request,event,RUNTIME_CACHE));return}if(rel&&SHELL_ASSETS.includes(rel)){event.respondWith(networkFirst(event.request,event,SHELL_CACHE));return}});
self.addEventListener('message',event=>{const m=event.data||{};if(m.type==='SKIP_WAITING'){self.skipWaiting();return}if(m.type==='GET_VERSION'){const payload={type:'MTS_PWA_VERSION',buildId:BUILD_ID};if(event.ports?.[0])event.ports[0].postMessage(payload);else if(event.source)event.source.postMessage(payload)}});
