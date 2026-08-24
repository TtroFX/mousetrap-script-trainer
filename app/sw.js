'use strict';

const BUILD_ID = 'p6-2026-08-24-r2';
const DATA_VERSION = 'p5-canonical-freeze-2026-08-24-r1';
const CACHE_PREFIX = 'mts-pwa-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-${BUILD_ID}`;
const DATA_CACHE = `${CACHE_PREFIX}data-${DATA_VERSION}`;
const VERSION_PATH = './pwa-version.json';
const OFFLINE_PATH = './offline.html';

const SHELL_ASSETS = [
  './index.html',
  './p5.css',
  './p5_app.js',
  './p6_pwa.css',
  './p6_pwa.js',
  './P2_learning.html',
  './008_cue_practice_P3.html',
  './009_rehearsal_P4.html',
  './manifest.webmanifest',
  VERSION_PATH,
  OFFLINE_PATH,
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

const DATA_FILES = new Set([
  'mousetrap_script_data.json',
  'mousetrap_line_translations.json',
  'mousetrap_line_vocabulary.json',
  'mousetrap_line_grammar.json',
  'mousetrap_word_dictionary.json'
]);

let contractPromise = null;

function errorResponse(code, message, status = 503) {
  return new Response(JSON.stringify({ok:false, code, message, buildId:BUILD_ID, dataVersion:DATA_VERSION}), {
    status,
    headers: {'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-mts-pwa-error':code}
  });
}

async function openCache(name) {
  try { return await caches.open(name); }
  catch { return null; }
}

async function fetchNoStore(requestOrUrl) {
  const request = typeof requestOrUrl === 'string'
    ? new Request(requestOrUrl, {cache:'no-store'})
    : new Request(requestOrUrl, {cache:'no-store'});
  return fetch(request);
}

async function sha256Hex(response) {
  if (!self.crypto || !self.crypto.subtle) throw new Error('CRYPTO_UNAVAILABLE');
  const bytes = await response.clone().arrayBuffer();
  const digest = await self.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function readContract() {
  if (contractPromise) return contractPromise;
  contractPromise = (async()=>{
    let response = null;
    const shell = await openCache(SHELL_CACHE);
    if (shell) response = await shell.match(VERSION_PATH);
    if (!response) {
      try { response = await fetchNoStore(VERSION_PATH); } catch {}
    }
    if (!response || !response.ok) throw new Error('VERSION_METADATA_UNAVAILABLE');
    const contract = await response.json();
    if (!contract || contract.schemaVersion !== 1) throw new Error('VERSION_METADATA_INVALID');
    if (contract.buildId !== BUILD_ID || contract.dataVersion !== DATA_VERSION) throw new Error('VERSION_MISMATCH');
    if (!Array.isArray(contract.canonicalDataFiles) || contract.canonicalDataFiles.length !== DATA_FILES.size) {
      throw new Error('DATA_CONTRACT_INVALID');
    }
    const byName = new Map();
    for (const item of contract.canonicalDataFiles) {
      const name = String(item?.path || '').split('/').pop();
      const hash = String(item?.sha256 || '').toLowerCase();
      if (!DATA_FILES.has(name) || !/^[0-9a-f]{64}$/.test(hash)) throw new Error('DATA_CONTRACT_INVALID');
      if (byName.has(name)) throw new Error('DATA_CONTRACT_DUPLICATE');
      byName.set(name, hash);
    }
    if (byName.size !== DATA_FILES.size) throw new Error('DATA_CONTRACT_INCOMPLETE');
    return {raw:contract, byName};
  })().catch(err=>{
    contractPromise = null;
    throw err;
  });
  return contractPromise;
}

async function precacheShell() {
  const cache = await openCache(SHELL_CACHE);
  if (!cache) throw new Error('CACHE_UNAVAILABLE');
  for (const asset of SHELL_ASSETS) {
    const response = await fetchNoStore(asset);
    if (!response.ok) throw new Error(`SHELL_ASSET_${response.status}:${asset}`);
    await cache.put(asset, response);
  }
}

async function warmCanonicalData() {
  let contract;
  try { contract = await readContract(); } catch { return; }
  const cache = await openCache(DATA_CACHE);
  if (!cache) return;
  for (const name of DATA_FILES) {
    try {
      const existing = await cache.match(`./${name}`);
      if (existing && existing.ok) {
        const hash = await sha256Hex(existing);
        if (hash === contract.byName.get(name)) continue;
        await cache.delete(`./${name}`);
      }
      const response = await fetchNoStore(`./${name}`);
      if (!response.ok) continue;
      const hash = await sha256Hex(response);
      if (hash !== contract.byName.get(name)) continue;
      await cache.put(`./${name}`, response);
    } catch {}
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    await precacheShell();
    await warmCanonicalData();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const names = await caches.keys().catch(()=>[]);
    await Promise.all(names.map(name=>{
      if (!name.startsWith(CACHE_PREFIX)) return Promise.resolve(false);
      if (name === SHELL_CACHE || name === DATA_CACHE) return Promise.resolve(false);
      return caches.delete(name);
    }));
    await self.clients.claim();
  })());
});

function shellRelativePath(url) {
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return null;
  let rel = url.pathname.slice(scope.pathname.length);
  if (!rel || rel === '/') rel = 'index.html';
  return `./${rel}`;
}

async function shellResponse(request) {
  const cache = await openCache(SHELL_CACHE);
  const rel = shellRelativePath(new URL(request.url));
  if (cache && rel) {
    const cached = await cache.match(rel);
    if (cached) return cached;
  }
  try {
    const response = await fetchNoStore(request);
    if (response.ok) return response;
  } catch {}
  if (cache) {
    const offline = await cache.match(OFFLINE_PATH);
    if (offline) return offline;
  }
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Offline</title><h1>Offline</h1><p>Application shell is unavailable.</p>',
    {status:503, headers:{'content-type':'text/html; charset=utf-8'}}
  );
}

async function canonicalDataResponse(request) {
  const name = new URL(request.url).pathname.split('/').pop();
  let contract;
  try { contract = await readContract(); }
  catch (err) { return errorResponse('VERSION_MISMATCH', String(err?.message || err)); }

  const expected = contract.byName.get(name);
  if (!expected) return errorResponse('DATA_CONTRACT_MISSING', name);

  const cache = await openCache(DATA_CACHE);
  if (cache) {
    const cached = await cache.match(`./${name}`);
    if (cached && cached.ok) {
      try {
        const hash = await sha256Hex(cached);
        if (hash === expected) return cached;
        await cache.delete(`./${name}`);
      } catch {
        await cache.delete(`./${name}`).catch(()=>{});
      }
    }
  }

  let response;
  try { response = await fetchNoStore(request); }
  catch { return errorResponse('OFFLINE_DATA_MISSING', name); }

  if (!response.ok) return errorResponse('DATA_NETWORK_ERROR', `${name}:${response.status}`, response.status >= 400 ? response.status : 503);

  let actual;
  try { actual = await sha256Hex(response); }
  catch { return errorResponse('DATA_HASH_UNAVAILABLE', name); }

  if (actual !== expected) return errorResponse('DATA_HASH_MISMATCH', name);

  if (cache) {
    try { await cache.put(`./${name}`, response.clone()); } catch {}
  }
  return response;
}

async function staticAssetResponse(request) {
  const rel = shellRelativePath(new URL(request.url));
  const cache = await openCache(SHELL_CACHE);
  if (cache && rel) {
    const cached = await cache.match(rel);
    if (cached) return cached;
  }
  try { return await fetchNoStore(request); }
  catch { return errorResponse('NETWORK_UNAVAILABLE', rel || request.url); }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const name = url.pathname.split('/').pop();
  if (DATA_FILES.has(name)) {
    event.respondWith(canonicalDataResponse(event.request));
    return;
  }

  const rel = shellRelativePath(url);
  if (event.request.mode === 'navigate') {
    event.respondWith(shellResponse(event.request));
    return;
  }

  if (rel && SHELL_ASSETS.includes(rel)) {
    event.respondWith(staticAssetResponse(event.request));
  }
});

self.addEventListener('message', event => {
  const message = event.data || {};
  if (message.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (message.type === 'GET_VERSION' && event.source) {
    event.source.postMessage({type:'MTS_PWA_VERSION', buildId:BUILD_ID, dataVersion:DATA_VERSION});
  }
});
