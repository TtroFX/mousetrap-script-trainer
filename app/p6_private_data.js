/* P6 production data resolver. Network-verified canonical data owns online startup; Cache Storage is offline fallback only. */
(()=>{
'use strict';
const VERSION_PATH='pwa-version.json';
const FETCH_TIMEOUT_MS=12000;
const HASH_TIMEOUT_MS=6000;
const CACHE_TIMEOUT_MS=900;
const nativeFetch=globalThis.fetch.bind(globalThis);
const EXPECTED_SCENES=Object.freeze([
  {sceneId:'act1-scene1',prefix:'act1-scene1-speech-',count:190},
  {sceneId:'act1-scene2',prefix:'act1-scene2-speech-',count:336},
  {sceneId:'act2',prefix:'act2-speech-',count:638}
]);
const FILES=Object.freeze([
  'mousetrap_script_data.json','mousetrap_line_translations.json','mousetrap_line_vocabulary.json','mousetrap_line_grammar.json','mousetrap_word_dictionary.json'
]);
const FILE_SET=new Set(FILES);
const EXPECTED_IDS=Object.freeze(EXPECTED_SCENES.flatMap(s=>Array.from({length:s.count},(_,i)=>s.prefix+String(i+1).padStart(4,'0'))));
const EXPECTED_ID_SET=new Set(EXPECTED_IDS);
const responseMemo=new Map(),jsonMemo=new Map();
const metrics={networkFetches:0,networkVerified:0,cacheFallbacks:0,cacheWritesQueued:0,cacheWriteFailures:0,hashChecks:0};
let contractPromise=null,preparePromise=null,lastQA=null;
function progress(message,extra={}){try{window.dispatchEvent(new CustomEvent('mts:data-progress',{detail:{message,...extra}}))}catch{}}
function object(v,name){if(!v||typeof v!=='object'||Array.isArray(v))throw Error(`${name}: object required`)}
function canonicalName(path){return String(path||'').split(/[\\/]/).pop().split(/[?#]/)[0]}
function withTimeout(promise,ms,code){return new Promise((resolve,reject)=>{let settled=false;const timer=setTimeout(()=>{if(settled)return;settled=true;reject(Error(code))},ms);Promise.resolve(promise).then(value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value)},error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error)})})}
async function fetchWithTimeout(input,init={},timeout=FETCH_TIMEOUT_MS){
  if(typeof AbortController==='undefined')return withTimeout(nativeFetch(input,init),timeout,`FETCH_TIMEOUT:${canonicalName(typeof input==='string'?input:input?.url||'resource')}`);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{return await nativeFetch(input,{...init,signal:controller.signal})}
  catch(error){if(error?.name==='AbortError')throw Error(`FETCH_TIMEOUT:${canonicalName(typeof input==='string'?input:input?.url||'resource')}`);throw error}
  finally{clearTimeout(timer)}
}
async function sha256Hex(response){
  if(!globalThis.crypto?.subtle)throw Error('SHA256_UNAVAILABLE');
  const bytes=await withTimeout(response.clone().arrayBuffer(),HASH_TIMEOUT_MS,'HASH_READ_TIMEOUT');
  const digest=await withTimeout(crypto.subtle.digest('SHA-256',bytes),HASH_TIMEOUT_MS,'HASH_DIGEST_TIMEOUT');
  metrics.hashChecks++;
  return[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function exactSpeechKeys(data,name){object(data,name);const keys=Object.keys(data);if(keys.length!==EXPECTED_IDS.length)throw Error(`${name}: ${keys.length}/${EXPECTED_IDS.length} speech keys`);const missing=EXPECTED_IDS.filter(id=>!Object.prototype.hasOwnProperty.call(data,id));const extra=keys.filter(id=>!EXPECTED_ID_SET.has(id));if(missing.length||extra.length)throw Error(`${name}: ID mismatch missing=${missing.length} extra=${extra.length}`)}
function validateScript(data){object(data,'script');let total=0;for(const scene of EXPECTED_SCENES){const speeches=data[scene.sceneId]?.speeches;if(!Array.isArray(speeches)||speeches.length!==scene.count)throw Error(`script.${scene.sceneId}: ${speeches?.length||0}/${scene.count}`);speeches.forEach((speech,i)=>{const expected=scene.prefix+String(i+1).padStart(4,'0');if(speech?.id!==expected)throw Error(`script.${scene.sceneId}: id/order mismatch #${i+1}`);if(!String(speech?.speaker||'').trim()||!String(speech?.text||'').trim())throw Error(`script: empty speaker/text ${expected}`)});total+=speeches.length}if(total!==1164)throw Error(`script total: ${total}/1164`);return{speeches:total,scenes:[190,336,638]}}
function validateTranslations(data){exactSpeechKeys(data,'translations');for(const id of EXPECTED_IDS){const entry=data[id];object(entry,`translations.${id}`);if(!String(entry.translation||'').trim()||!String(entry.translationSource||'').trim())throw Error(`translations.${id}: invalid`)}return 1164}
function validateVocabulary(data){exactSpeechKeys(data,'vocabulary');let count=0;for(const id of EXPECTED_IDS){const entries=data[id];if(!Array.isArray(entries))throw Error(`vocabulary.${id}: array required`);for(const entry of entries){object(entry,`vocabulary.${id}`);for(const key of ['surface','lemma','meaning'])if(!String(entry[key]||'').trim())throw Error(`vocabulary.${id}.${key}: invalid`);count++}}if(count!==1186)throw Error(`vocabulary items: ${count}/1186`);return count}
function validateGrammar(data){exactSpeechKeys(data,'grammar');let count=0;for(const id of EXPECTED_IDS){const entries=data[id];if(!Array.isArray(entries))throw Error(`grammar.${id}: array required`);for(const entry of entries){object(entry,`grammar.${id}`);if(!String(entry.pattern||'').trim()||!String(entry.description||'').trim())throw Error(`grammar.${id}: invalid entry`);count++}}if(count!==692)throw Error(`grammar items: ${count}/692`);return count}
function validateDictionary(data,vocabulary){object(data,'dictionary');const keys=Object.keys(data);if(keys.length!==578)throw Error(`dictionary entries: ${keys.length}/578`);const normalized=new Set(keys.map(k=>k.toLowerCase().trim()));let missing=0;for(const id of EXPECTED_IDS)for(const entry of vocabulary[id])if(!normalized.has(String(entry.lemma||'').toLowerCase().trim()))missing++;if(missing)throw Error(`dictionary missing vocabulary refs: ${missing}`);return keys.length}
function validateAll(payloads){const script=validateScript(payloads['mousetrap_script_data.json']);const translations=validateTranslations(payloads['mousetrap_line_translations.json']);const vocabulary=validateVocabulary(payloads['mousetrap_line_vocabulary.json']);const grammar=validateGrammar(payloads['mousetrap_line_grammar.json']);const dictionary=validateDictionary(payloads['mousetrap_word_dictionary.json'],payloads['mousetrap_line_vocabulary.json']);return Object.freeze({status:'PASS',script,translations,vocabulary,grammar,dictionary})}
async function loadContract(){
  if(contractPromise)return contractPromise;
  contractPromise=(async()=>{
    progress('データ契約を確認しています…');
    const response=await fetchWithTimeout(VERSION_PATH,{cache:'no-store',credentials:'same-origin'},8000);
    if(!response.ok)throw Error(`VERSION_METADATA_HTTP_${response.status}`);
    const raw=await response.json();
    if(raw?.schemaVersion!==1||!String(raw.buildId||'')||!String(raw.dataVersion||''))throw Error('VERSION_METADATA_INVALID');
    if(!Array.isArray(raw.canonicalDataFiles)||raw.canonicalDataFiles.length!==FILES.length)throw Error('DATA_CONTRACT_INVALID');
    const byName=new Map();
    for(const item of raw.canonicalDataFiles){const name=canonicalName(item?.path),hash=String(item?.sha256||'').toLowerCase();if(!FILE_SET.has(name)||byName.has(name)||!/^[0-9a-f]{64}$/.test(hash))throw Error('DATA_CONTRACT_INVALID');byName.set(name,hash)}
    if(byName.size!==FILES.length)throw Error('DATA_CONTRACT_INCOMPLETE');
    return Object.freeze({raw,byName,cacheName:`mts-pwa-data-${raw.dataVersion}`});
  })().catch(error=>{contractPromise=null;throw error});
  return contractPromise;
}
async function openCache(contract){if(!('caches'in globalThis))return null;try{return await withTimeout(caches.open(contract.cacheName),CACHE_TIMEOUT_MS,'CACHE_OPEN_TIMEOUT')}catch{return null}}
async function readOfflineCache(contract,name,expected){
  const cache=await openCache(contract);if(!cache)return null;
  for(const key of [`./${name}`,new URL(name,location.href).href]){
    let response=null;try{response=await withTimeout(cache.match(key),CACHE_TIMEOUT_MS,'CACHE_READ_TIMEOUT')}catch{}
    if(!response?.ok)continue;
    try{if(await sha256Hex(response)===expected){metrics.cacheFallbacks++;return response.clone()}}catch{}
  }
  return null;
}
function queueCacheWrite(contract,name,response){
  if(!('caches'in globalThis))return;
  metrics.cacheWritesQueued++;
  Promise.resolve().then(async()=>{const cache=await caches.open(contract.cacheName);await cache.put(`./${name}`,response.clone())}).catch(()=>{metrics.cacheWriteFailures++});
}
async function getVerifiedResponse(path){
  const name=canonicalName(path),contract=await loadContract();
  if(!FILE_SET.has(name)||!contract.byName.has(name))throw Error(`DATA_NOT_IN_CONTRACT:${name}`);
  const memo=responseMemo.get(name);if(memo)return memo.clone();
  const expected=contract.byName.get(name),position=FILES.indexOf(name)+1;
  progress(`Production dataを読み込んでいます… ${position}/${FILES.length}`,{file:name,index:position,total:FILES.length});
  let networkError=null;
  try{
    metrics.networkFetches++;
    const response=await fetchWithTimeout(`./${name}`,{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw Error(`PRODUCTION_DATA_HTTP_${response.status}:${name}`);
    progress(`Production dataを検証しています… ${position}/${FILES.length}`,{file:name,index:position,total:FILES.length});
    const actual=await sha256Hex(response);
    if(actual!==expected)throw Error(`DATA_HASH_MISMATCH:${name}`);
    metrics.networkVerified++;
    responseMemo.set(name,response.clone());
    queueCacheWrite(contract,name,response);
    return response.clone();
  }catch(error){networkError=error}
  progress(`オフライン保存データを確認しています… ${position}/${FILES.length}`,{file:name,index:position,total:FILES.length});
  const cached=await readOfflineCache(contract,name,expected);
  if(cached){responseMemo.set(name,cached.clone());return cached.clone()}
  throw networkError||Error(`PRODUCTION_DATA_UNAVAILABLE:${name}`);
}
async function getVerifiedJson(path){const name=canonicalName(path);if(jsonMemo.has(name))return jsonMemo.get(name);const value=await (await getVerifiedResponse(name)).json();jsonMemo.set(name,value);return value}
async function prepare(){if(preparePromise)return preparePromise;preparePromise=(async()=>{const payloads={};await Promise.all(FILES.map(async name=>{payloads[name]=await getVerifiedJson(name)}));lastQA=validateAll(payloads);progress('Production dataの準備が完了しました。',{status:'PASS'});return lastQA})().catch(error=>{preparePromise=null;lastQA=null;throw error});return preparePromise}
function getStatus(){return lastQA}
function getMetrics(){return Object.freeze({...metrics,memoizedResponses:responseMemo.size,memoizedJson:jsonMemo.size})}
window.MTS_PRIVATE_DATA=Object.freeze({version:6,files:FILES,loadContract,getVerifiedResponse,getVerifiedJson,prepare,validateAll,getStatus,getMetrics});
})();
