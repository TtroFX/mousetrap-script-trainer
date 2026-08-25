'use strict';
const BUILD_ID='p6-2026-08-25-r6';
const DATA_VERSION='p5-canonical-recovery-2026-08-25-r2';
const CACHE_PREFIX='mts-pwa-';
const SHELL_CACHE=`${CACHE_PREFIX}shell-${BUILD_ID}`;
const DATA_CACHE=`${CACHE_PREFIX}data-${DATA_VERSION}`;
const LEGACY_PRIVATE_CACHE='mts-private-production-v1';
const VERSION_PATH='./pwa-version.json';
const OFFLINE_PATH='./offline.html';
const SHELL_ASSETS=[
  './index.html','./p5.css','./p5_app.js','./p6_private_data.js','./pages_private_import.js','./p6_pwa.css','./p6_pwa.js',
  './P2_learning.html','./008_cue_practice_P3.html','./009_rehearsal_P4.html',
  './manifest.webmanifest',VERSION_PATH,OFFLINE_PATH,
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png'
];
const DATA_FILES=new Set([
  'mousetrap_script_data.json','mousetrap_line_translations.json','mousetrap_line_vocabulary.json',
  'mousetrap_line_grammar.json','mousetrap_word_dictionary.json'
]);
let contractPromise=null;

function errorResponse(code,message,status=503){
  return new Response(JSON.stringify({ok:false,code,message,buildId:BUILD_ID,dataVersion:DATA_VERSION}),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-mts-pwa-error':code}
  });
}
async function openCache(name){try{return await caches.open(name)}catch{return null}}
function noStoreRequest(requestOrUrl){
  const source=typeof requestOrUrl==='string'?new Request(requestOrUrl):requestOrUrl;
  return new Request(source,{cache:'no-store',credentials:'same-origin'});
}
async function fetchNoStore(requestOrUrl){return fetch(noStoreRequest(requestOrUrl))}
async function sha256Hex(response){
  if(!self.crypto?.subtle)throw Error('CRYPTO_UNAVAILABLE');
  const bytes=await response.clone().arrayBuffer();
  const digest=await self.crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function readContract(){
  if(contractPromise)return contractPromise;
  contractPromise=(async()=>{
    let response=null;
    const shell=await openCache(SHELL_CACHE);
    if(shell)response=await shell.match(VERSION_PATH);
    if(!response)response=await fetchNoStore(VERSION_PATH);
    if(!response?.ok)throw Error('VERSION_METADATA_UNAVAILABLE');
    const contract=await response.json();
    if(contract?.schemaVersion!==1)throw Error('VERSION_METADATA_INVALID');
    if(contract.buildId!==BUILD_ID||contract.dataVersion!==DATA_VERSION)throw Error('VERSION_MISMATCH');
    if(!Array.isArray(contract.canonicalDataFiles)||contract.canonicalDataFiles.length!==DATA_FILES.size)throw Error('DATA_CONTRACT_INVALID');
    const byName=new Map();
    for(const item of contract.canonicalDataFiles){
      const name=String(item?.path||'').split('/').pop();
      const hash=String(item?.sha256||'').toLowerCase();
      if(!DATA_FILES.has(name)||!/^[0-9a-f]{64}$/.test(hash)||byName.has(name))throw Error('DATA_CONTRACT_INVALID');
      byName.set(name,hash);
    }
    if(byName.size!==DATA_FILES.size)throw Error('DATA_CONTRACT_INCOMPLETE');
    return {raw:contract,byName};
  })().catch(error=>{contractPromise=null;throw error});
  return contractPromise;
}
async function precacheShell(){
  const cache=await openCache(SHELL_CACHE);
  if(!cache)throw Error('CACHE_UNAVAILABLE');
  for(const asset of SHELL_ASSETS){
    const response=await fetchNoStore(asset);
    if(!response.ok)throw Error(`SHELL_ASSET_${response.status}:${asset}`);
    await cache.put(asset,response);
  }
}
async function verifiedCached(cache,name,expected){
  if(!cache)return null;
  for(const key of [`./${name}`,new URL(name,self.registration.scope).href]){
    const response=await cache.match(key);
    if(!response?.ok)continue;
    try{
      if(await sha256Hex(response)===expected)return response;
      await cache.delete(key);
    }catch{await cache.delete(key).catch(()=>{})}
  }
  return null;
}
async function warmCanonicalData(){
  const contract=await readContract();
  const cache=await openCache(DATA_CACHE);
  if(!cache)throw Error('DATA_CACHE_UNAVAILABLE');
  for(const name of DATA_FILES){
    const expected=contract.byName.get(name);
    const cached=await verifiedCached(cache,name,expected);
    if(cached)continue;
    const response=await fetchNoStore(`./${name}`);
    if(!response.ok)throw Error(`PRODUCTION_DATA_HTTP_${response.status}:${name}`);
    const actual=await sha256Hex(response);
    if(actual!==expected)throw Error(`DATA_HASH_MISMATCH:${name}`);
    await cache.put(`./${name}`,response);
  }
}
async function atomicInstall(){
  try{
    await precacheShell();
    await warmCanonicalData();
  }catch(error){
    await Promise.allSettled([caches.delete(SHELL_CACHE),caches.delete(DATA_CACHE)]);
    throw error;
  }
}
self.addEventListener('install',event=>event.waitUntil(atomicInstall()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const names=await caches.keys().catch(()=>[]);
  await Promise.all(names.map(name=>{
    if(name===LEGACY_PRIVATE_CACHE)return caches.delete(name);
    if(!name.startsWith(CACHE_PREFIX))return false;
    if(name===SHELL_CACHE||name===DATA_CACHE)return false;
    return caches.delete(name);
  }));
  await self.clients.claim();
})()));
function shellRelativePath(url){
  const scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return null;
  let rel=url.pathname.slice(scope.pathname.length);
  if(!rel||rel==='/')rel='index.html';
  return `./${rel}`;
}
async function shellResponse(request){
  const cache=await openCache(SHELL_CACHE);
  const rel=shellRelativePath(new URL(request.url));
  if(cache&&rel){const cached=await cache.match(rel);if(cached)return cached}
  try{const response=await fetchNoStore(request);if(response.ok)return response}catch{}
  if(cache){const fallback=await cache.match(OFFLINE_PATH);if(fallback)return fallback}
  return new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><h1>Offline</h1><p>Application shell is unavailable.</p>',{status:503,headers:{'content-type':'text/html; charset=utf-8'}});
}
async function canonicalDataResponse(request){
  const name=new URL(request.url).pathname.split('/').pop();
  let contract;
  try{contract=await readContract()}catch(error){return errorResponse('VERSION_MISMATCH',String(error?.message||error))}
  const expected=contract.byName.get(name);
  if(!expected)return errorResponse('DATA_CONTRACT_MISSING',name);
  const cache=await openCache(DATA_CACHE);
  const cached=await verifiedCached(cache,name,expected);
  if(cached)return cached;
  let response;
  try{response=await fetchNoStore(request)}catch{return errorResponse('OFFLINE_DATA_MISSING',name)}
  if(!response.ok)return errorResponse('DATA_NETWORK_ERROR',`${name}:${response.status}`,response.status>=400?response.status:503);
  let actual;
  try{actual=await sha256Hex(response)}catch{return errorResponse('DATA_HASH_UNAVAILABLE',name)}
  if(actual!==expected)return errorResponse('DATA_HASH_MISMATCH',name);
  if(cache)try{await cache.put(`./${name}`,response.clone())}catch{}
  return response;
}
async function staticAssetResponse(request){
  const rel=shellRelativePath(new URL(request.url));
  const cache=await openCache(SHELL_CACHE);
  if(cache&&rel){const cached=await cache.match(rel);if(cached)return cached}
  try{return await fetchNoStore(request)}catch{return errorResponse('NETWORK_UNAVAILABLE',rel||request.url)}
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const name=url.pathname.split('/').pop();
  if(DATA_FILES.has(name)){event.respondWith(canonicalDataResponse(event.request));return}
  const rel=shellRelativePath(url);
  if(event.request.mode==='navigate'){event.respondWith(shellResponse(event.request));return}
  if(rel&&SHELL_ASSETS.includes(rel))event.respondWith(staticAssetResponse(event.request));
});
self.addEventListener('message',event=>{
  const message=event.data||{};
  if(message.type==='SKIP_WAITING'){self.skipWaiting();return}
  if(message.type==='GET_VERSION'&&event.source)event.source.postMessage({type:'MTS_PWA_VERSION',buildId:BUILD_ID,dataVersion:DATA_VERSION});
});
