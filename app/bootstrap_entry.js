(()=>{
'use strict';
const BUILD_ID='p6-2026-08-25-r17';
const MIGRATION_KEY=`mts.bootstrap.migrated.${BUILD_ID}`;
const APP_SCRIPTS=['p5_app.js','practice_navigation.js','reader_sheet.js','p6_pwa.js'];
function storageGet(key){try{return localStorage.getItem(key)||sessionStorage.getItem(key)}catch{return null}}
function storageSet(key,value){try{localStorage.setItem(key,value);return}catch{}try{sessionStorage.setItem(key,value)}catch{}}
function preNavigation(){document.querySelectorAll('[data-pre-nav]').forEach(button=>button.addEventListener('click',()=>{location.hash=`#/${button.dataset.preNav}`}));document.querySelectorAll('[data-pre-scene]').forEach(button=>button.addEventListener('click',()=>{try{localStorage.setItem('mts.selectedSceneId',button.dataset.preScene)}catch{}location.hash='#/script'}))}
async function clearLegacyRuntime(){
  if('serviceWorker'in navigator){const regs=await navigator.serviceWorker.getRegistrations().catch(()=>[]);await Promise.allSettled(regs.map(reg=>reg.unregister()))}
  if('caches'in globalThis){const names=await caches.keys().catch(()=>[]);const legacy=names.filter(name=>name.startsWith('mts-pwa-shell-')||name.startsWith('mts-pwa-data-')||name.startsWith('mts-pwa-runtime-')||name==='mts-private-production-v1');await Promise.allSettled(legacy.map(name=>caches.delete(name)))}
}
async function migrateOnce(){if(storageGet(MIGRATION_KEY)==='1')return false;await clearLegacyRuntime();storageSet(MIGRATION_KEY,'1');const next=new URL(location.href);next.searchParams.set('mts-build','r17');next.searchParams.set('mts-migrate',Date.now().toString(36));location.replace(next.href);return true}
function loadScript(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=`${src}?v=${encodeURIComponent(BUILD_ID)}`;script.async=false;script.onload=resolve;script.onerror=()=>reject(Error(`SCRIPT_LOAD_FAILED:${src}`));document.head.appendChild(script)})}
preNavigation();
(async()=>{try{if(await migrateOnce())return;for(const src of APP_SCRIPTS)await loadScript(src)}catch(error){console.error('MTS bootstrap failed',error);const host=document.getElementById('dataStatus');if(host){host.textContent='アプリの読み込みに失敗しました。ページを再読み込みしてください。';host.hidden=false}}})();
})();
