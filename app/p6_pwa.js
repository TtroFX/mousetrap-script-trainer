(()=>{'use strict';
const statusHost=document.getElementById('pwaStatus');
let applyingUpdate=false;
let reloading=false;
const state={registration:null,installPrompt:null,standalone:window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true};
function hideStatus(){if(statusHost){statusHost.hidden=true;statusHost.replaceChildren()}}
function showStatus(message,actionLabel,action){if(!statusHost)return;statusHost.replaceChildren();const text=document.createElement('span');text.textContent=message;statusHost.appendChild(text);if(actionLabel&&action){const button=document.createElement('button');button.type='button';button.textContent=actionLabel;button.addEventListener('click',action,{once:true});statusHost.appendChild(button)}statusHost.hidden=false}
function expose(extra={}){window.MTS_PWA=Object.assign(window.MTS_PWA||{},state,extra)}
function bindWaiting(reg){if(!reg.waiting)return false;showStatus('更新版を利用できます。現在の状態は保持されます。','Update',()=>{applyingUpdate=true;reg.waiting?.postMessage({type:'SKIP_WAITING'})});return true}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.installPrompt=event;expose({install:async()=>{const p=state.installPrompt;if(!p)return {outcome:'unavailable'};await p.prompt();const result=await p.userChoice;state.installPrompt=null;hideStatus();return result}});if(!state.standalone)showStatus('この端末にアプリとしてインストールできます。','Install',()=>window.MTS_PWA.install())});
window.addEventListener('appinstalled',()=>{state.installPrompt=null;state.standalone=true;hideStatus();expose()});
if(!('serviceWorker'in navigator)){showStatus('Offline support is not available in this browser.');expose({supported:false});return}
navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!applyingUpdate||reloading)return;reloading=true;location.reload()});
navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{state.registration=reg;expose({supported:true});if(!bindWaiting(reg)&&state.standalone)hideStatus();reg.addEventListener('updatefound',()=>{const worker=reg.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)bindWaiting(reg)})});reg.update().catch(()=>{})}).catch(err=>{console.error('PWA service worker registration failed',err);showStatus('Offline support could not start. Online learning remains available.','Retry',()=>location.reload());expose({supported:true,error:String(err?.message||err)})});
})();
