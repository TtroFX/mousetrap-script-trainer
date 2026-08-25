(()=>{
'use strict';
const BUILD_ID='p6-2026-08-25-r16';
const MIGRATION_KEY=`mts.bootstrap.migrated.${BUILD_ID}`;
const APP_SCRIPTS=[
  'p6_private_data.js',
  'pages_private_import.js',
  'p6_pwa.js',
  'p5_app.js',
  'practice_navigation.js',
  'reader_sheet.js'
];
const status=document.getElementById('gateStatus');
const gate=document.getElementById('dataGate');
function setStatus(message,isError=false){
  if(!status)return;
  status.textContent=message;
  status.classList.toggle('error',!!isError);
}
function storageGet(key){try{return localStorage.getItem(key)||sessionStorage.getItem(key)}catch{return null}}
function storageSet(key,value){try{localStorage.setItem(key,value);return}catch{}try{sessionStorage.setItem(key,value)}catch{}}
async function clearLegacyRuntime(){
  setStatus('アプリ更新を適用しています…');
  if('serviceWorker'in navigator){
    const regs=await navigator.serviceWorker.getRegistrations().catch(()=>[]);
    await Promise.allSettled(regs.map(reg=>reg.unregister()));
  }
  if('caches'in globalThis){
    const names=await caches.keys().catch(()=>[]);
    const legacy=names.filter(name=>name.startsWith('mts-pwa-shell-')||name.startsWith('mts-pwa-data-')||name==='mts-private-production-v1');
    await Promise.allSettled(legacy.map(name=>caches.delete(name)));
  }
}
async function migrateOnce(){
  if(storageGet(MIGRATION_KEY)==='1')return false;
  await clearLegacyRuntime();
  storageSet(MIGRATION_KEY,'1');
  const next=new URL(location.href);
  next.searchParams.set('mts-build','r16');
  next.searchParams.set('mts-migrate',Date.now().toString(36));
  location.replace(next.href);
  return true;
}
function loadScript(src){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=`${src}?v=${encodeURIComponent(BUILD_ID)}`;
    script.async=false;
    script.onload=()=>resolve();
    script.onerror=()=>reject(Error(`SCRIPT_LOAD_FAILED:${src}`));
    document.head.appendChild(script);
  });
}
window.addEventListener('mts:data-progress',event=>{
  const detail=event.detail||{};
  if(detail.message&&gate&&!gate.hidden)setStatus(detail.message);
});
(async()=>{
  try{
    if(await migrateOnce())return;
    setStatus('起動準備中…');
    for(const src of APP_SCRIPTS)await loadScript(src);
  }catch(error){
    console.error('MTS bootstrap failed',error);
    if(gate)gate.hidden=false;
    setStatus(`起動に失敗しました。\n${error?.message||error}\nページを再読み込みしてください。`,true);
  }
})();
})();
