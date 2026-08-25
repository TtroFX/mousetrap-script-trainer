(()=>{'use strict';
async function getVerifiedResponse(path){
  const r=await fetch(`./${path}`,{cache:'no-store',credentials:'same-origin'});
  if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);
  return r;
}
async function getVerifiedJson(path){return (await getVerifiedResponse(path)).json()}
window.MTS_PRIVATE_DATA=Object.freeze({version:18,mode:'STATIC_COMPAT_ONLY',getVerifiedResponse,getVerifiedJson});
})();
