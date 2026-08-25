(()=>{'use strict';
const MAX_WAIT_MS=12000;
const RECOVERY_KEY='mts.bootstrap.recovery.v1';
const gate=document.getElementById('dataGate');
const status=document.getElementById('gateStatus');
let done=false;
function gateReady(){return !gate||gate.hidden||window.MTS_P5_QA?.status==='PASS'}
function finish(){done=true;clearTimeout(timer)}
async function clearShellOnly(){
  if('caches'in window){
    const names=await caches.keys().catch(()=>[]);
    await Promise.allSettled(names.filter(n=>n.startsWith('mts-pwa-shell-')).map(n=>caches.delete(n)));
  }
}
async function unregisterScope(){
  if(!('serviceWorker'in navigator))return;
  const regs=await navigator.serviceWorker.getRegistrations().catch(()=>[]);
  await Promise.allSettled(regs.filter(r=>String(r.scope||'').startsWith(location.origin+location.pathname.replace(/[^/]*$/,''))).map(r=>r.unregister()));
}
async function recover(){
  if(done||gateReady())return finish();
  const already=sessionStorage.getItem(RECOVERY_KEY)==='1';
  if(already){
    if(status){status.textContent='読み込みを完了できませんでした。Retryを押してください。改善しない場合はページを再読み込みしてください。';status.classList.add('error')}
    return finish();
  }
  sessionStorage.setItem(RECOVERY_KEY,'1');
  if(status)status.textContent='古いPWAキャッシュを検出しました。安全に復旧して再読み込みします…';
  try{await unregisterScope();await clearShellOnly()}catch{}
  const u=new URL(location.href);u.searchParams.set('mts-recover',Date.now().toString(36));
  location.replace(u.href);
}
window.addEventListener('mts:bootstrap-ready',()=>{sessionStorage.removeItem(RECOVERY_KEY);finish()});
window.addEventListener('error',()=>{if(!gateReady())setTimeout(recover,0)},{once:true});
window.addEventListener('unhandledrejection',()=>{if(!gateReady())setTimeout(recover,0)},{once:true});
const timer=setTimeout(recover,MAX_WAIT_MS);
const observer=new MutationObserver(()=>{if(gateReady()){sessionStorage.removeItem(RECOVERY_KEY);observer.disconnect();finish()}});
if(gate)observer.observe(gate,{attributes:true,attributeFilter:['hidden']});
})();
