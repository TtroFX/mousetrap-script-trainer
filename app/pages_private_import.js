/* GitHub Pages-safe private data bootstrap.
 * Copyright-bearing canonical JSON stays off the public repository and Pages artifact.
 * The user selects the five canonical JSON files locally; bytes are SHA-256 checked
 * against pwa-version.json, structurally validated, and stored only in this browser's
 * versioned Cache Storage. No selected file is uploaded anywhere.
 */
(()=>{
'use strict';

const FILES=Object.freeze([
  'mousetrap_script_data.json',
  'mousetrap_line_translations.json',
  'mousetrap_line_vocabulary.json',
  'mousetrap_line_grammar.json',
  'mousetrap_word_dictionary.json'
]);
const button=document.getElementById('pagesDataBtn');
const input=document.getElementById('pagesDataFiles');
const status=document.getElementById('gateStatus');
if(!button||!input)return;

async function sha256Hex(bytes){
  if(!globalThis.crypto?.subtle)throw Error('SHA256_UNAVAILABLE');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function loadContract(){
  const response=await fetch('pwa-version.json',{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)throw Error(`pwa-version.json: HTTP ${response.status}`);
  const raw=await response.json();
  if(raw?.schemaVersion!==1||!raw.dataVersion||!Array.isArray(raw.canonicalDataFiles))throw Error('INVALID_DATA_CONTRACT');
  const byName=new Map(raw.canonicalDataFiles.map(item=>[
    String(item?.path||'').split('/').pop(),
    String(item?.sha256||'').toLowerCase()
  ]));
  for(const name of FILES)if(!/^[0-9a-f]{64}$/.test(byName.get(name)||''))throw Error(`MISSING_DATA_HASH:${name}`);
  return {raw,byName};
}
async function install(fileList){
  if(!('caches'in globalThis))throw Error('CACHE_STORAGE_UNAVAILABLE');
  const files=new Map(Array.from(fileList||[]).map(file=>[file.name,file]));
  const missing=FILES.filter(name=>!files.has(name));
  if(missing.length)throw Error(`必要なJSONが不足しています: ${missing.join(', ')}`);

  const contract=await loadContract();
  const prepared=new Map();
  const parsed={};
  for(const name of FILES){
    const bytes=await files.get(name).arrayBuffer();
    const actual=await sha256Hex(bytes);
    if(actual!==contract.byName.get(name))throw Error(`${name}: SHA-256 mismatch`);
    try{parsed[name]=JSON.parse(new TextDecoder().decode(bytes))}
    catch{throw Error(`${name}: invalid JSON`)}
    prepared.set(name,bytes);
  }

  const validator=window.MTS_PRIVATE_DATA?.validateAll;
  if(typeof validator!=='function')throw Error('PRODUCTION_VALIDATOR_UNAVAILABLE');
  const qa=validator(parsed);
  const cacheName=`mts-pwa-data-${contract.raw.dataVersion}`;
  await caches.delete(cacheName);
  try{
    const cache=await caches.open(cacheName);
    for(const name of FILES){
      await cache.put(`./${name}`,new Response(prepared.get(name),{
        status:200,
        headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-mts-private-data':'local-verified'}
      }));
    }
  }catch(error){
    await caches.delete(cacheName).catch(()=>{});
    throw error;
  }
  return {status:'PASS',cacheName,qa};
}

button.addEventListener('click',()=>input.click());
input.addEventListener('change',async()=>{
  if(!input.files?.length)return;
  button.disabled=true;
  if(status){status.classList.remove('error');status.textContent='Private production dataを検証しています…'}
  try{
    const result=await install(input.files);
    if(status)status.textContent=`PASS · ${result.qa.script.speeches} speeches\n端末内に検証済みデータを保存しました。再起動します…`;
    input.value='';
    location.reload();
  }catch(error){
    if(status){status.classList.add('error');status.textContent=`PRIVATE DATA IMPORT FAILED\n${error?.message||error}\n5つのcanonical JSONを選び直してください。`}
    button.disabled=false;
  }
});

window.MTS_PAGES_PRIVATE_IMPORT=Object.freeze({version:1,files:FILES,install});
})();
