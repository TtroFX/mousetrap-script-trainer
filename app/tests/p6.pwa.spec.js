const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';
const SESSION='act1-scene1|MOLLIE';
const DATA_VERSION='p5-canonical-freeze-2026-08-24-r1';
const BUILD_ID='p6-2026-08-24-r4';
const DATA=['mousetrap_script_data.json','mousetrap_line_translations.json','mousetrap_line_vocabulary.json','mousetrap_line_grammar.json','mousetrap_word_dictionary.json'];

async function controlled(page){
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#dataGate')).toBeHidden();
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:8000});
  await expect(page.locator('#dataGate')).toBeHidden();
}
async function noOverflow(page){
  const s=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  expect(s.scroll).toBeLessThanOrEqual(s.client+1);
}
async function child(page,name){
  await expect.poll(()=>page.frames().some(f=>f.url().includes(name))).toBe(true);
  return page.frames().find(f=>f.url().includes(name));
}

test('manifest, icons and production metadata are reachable',async({page})=>{
  await controlled(page);
  const r=await page.evaluate(async()=>{
    const m=await (await fetch('manifest.webmanifest')).json();
    const v=await (await fetch('pwa-version.json')).json();
    const icons=await Promise.all(m.icons.map(async x=>({status:(await fetch(x.src)).status})));
    return{m,v,icons};
  });
  expect(r.m.display).toBe('standalone');
  expect(r.m.start_url).toBe('./index.html');
  expect(r.m.scope).toBe('./');
  expect(r.icons.every(x=>x.status===200)).toBe(true);
  expect(r.v.buildId).toBe(BUILD_ID);
  expect(r.v.dataVersion).toBe(DATA_VERSION);
  expect(r.v.canonicalDataFiles).toHaveLength(5);
});

test('Chromium manifest has no installability errors',async({page,context})=>{
  await controlled(page);
  const cdp=await context.newCDPSession(page);
  const m=await cdp.send('Page.getAppManifest');
  const i=await cdp.send('Page.getInstallabilityErrors');
  expect(m.errors||[]).toEqual([]);
  expect(m.url).toContain('manifest.webmanifest');
  expect(i.installabilityErrors||[]).toEqual([]);
});

test('service worker reports r4 build and canonical data version',async({page})=>{
  await controlled(page);
  const v=await page.evaluate(()=>new Promise(resolve=>{
    const t=setTimeout(()=>resolve(null),3000);
    const h=e=>{if(e.data?.type==='MTS_PWA_VERSION'){clearTimeout(t);navigator.serviceWorker.removeEventListener('message',h);resolve(e.data)}};
    navigator.serviceWorker.addEventListener('message',h);
    navigator.serviceWorker.controller.postMessage({type:'GET_VERSION'});
  }));
  expect(v).toEqual({type:'MTS_PWA_VERSION',buildId:BUILD_ID,dataVersion:DATA_VERSION});
});

test('canonical production resolver automatically validates and caches all five datasets',async({page})=>{
  await controlled(page);
  const out=await page.evaluate(async({dataVersion,names})=>{
    const qa=await MTS_PRIVATE_DATA.prepare();
    const cacheName=`mts-pwa-data-${dataVersion}`;
    const cache=await caches.open(cacheName);
    const keys=(await cache.keys()).map(r=>new URL(r.url).pathname.split('/').pop());
    return{qa,cacheName,namesPresent:names.every(n=>keys.includes(n)),legacy:(await caches.keys()).includes('mts-private-production-v1')};
  },{dataVersion:DATA_VERSION,names:DATA});
  expect(out.qa.status).toBe('PASS');
  expect(out.qa.script.speeches).toBe(1164);
  expect(out.qa.translations).toBe(1164);
  expect(out.qa.vocabulary).toBe(1186);
  expect(out.qa.grammar).toBe(692);
  expect(out.qa.dictionary).toBe(578);
  expect(out.namesPresent).toBe(true);
  expect(out.legacy).toBe(false);
});

test('Reader Full Mine Cue Focus, Search and role persistence remain functional',async({page})=>{
  await controlled(page);
  await page.evaluate(()=>{localStorage.setItem('mts.characterId','MOLLIE');localStorage.setItem('mts.selectedSceneId','act1-scene1');localStorage.removeItem('mts.reader.mode')});
  await page.goto(BASE+'#/script');
  const full=await page.locator('[data-line]').count();
  expect(full).toBe(190);
  await page.getByRole('button',{name:'Mine'}).click();
  const mine=await page.locator('[data-line]').count();
  expect(mine).toBeGreaterThan(0);
  expect(mine).toBeLessThan(full);
  expect(await page.evaluate(()=>localStorage.getItem('mts.reader.mode'))).toBe('mine');
  for(const s of await page.locator('.speaker').allTextContents())expect(s).toContain('MOLLIE');
  await page.getByRole('button',{name:'Cue Focus'}).click();
  expect(await page.locator('[data-line]').count()).toBeGreaterThanOrEqual(mine);
  await page.reload();
  expect(await page.evaluate(()=>localStorage.getItem('mts.characterId'))).toBe('MOLLIE');
  expect(await page.evaluate(()=>localStorage.getItem('mts.reader.mode'))).toBe('cue');
  await page.goto(BASE+'#/search?q=MOLLIE');
  await expect(page.locator('.search-result').first()).toBeVisible();
  const id=await page.locator('.search-result').first().getAttribute('data-search-line');
  await page.locator('.search-result').first().click();
  await expect(page.locator('#learningOverlay')).toBeVisible();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('mts.lineDetail.current')||'null'));
  expect(saved.lineId).toBe(id);
});

test('offline reload keeps Reader, learning shell and saved progress usable',async({page,context})=>{
  await controlled(page);
  await page.evaluate(()=>{
    localStorage.setItem('mts.characterId','MOLLIE');
    localStorage.setItem('mts.selectedSceneId','act1-scene2');
    localStorage.setItem('mts.reader.progress',JSON.stringify({globalSeen:['act1-scene1-speech-0001'],roles:{MOLLIE:['act1-scene1-speech-0002']}}));
    localStorage.setItem('mts.sceneProgress',JSON.stringify({'act1-scene1':44,'act1-scene2':55,'act2':66}));
  });
  await page.goto(BASE+'#/script');
  await expect(page.locator('[data-line]').first()).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#dataGate')).toBeHidden();
  await page.locator('[data-line]').first().click();
  await expect(page.locator('#learningOverlay')).toBeVisible();
  const p=await page.evaluate(()=>({scene:localStorage.getItem('mts.selectedSceneId'),role:localStorage.getItem('mts.characterId'),reader:JSON.parse(localStorage.getItem('mts.reader.progress')),progress:JSON.parse(localStorage.getItem('mts.sceneProgress'))}));
  expect(p.scene).toBe('act1-scene2');
  expect(p.role).toBe('MOLLIE');
  expect(p.reader.globalSeen).toContain('act1-scene1-speech-0001');
  expect(p.progress.act2).toBe(66);
  for(const r of ['scene','practice','progress','more','search']){await page.goto(BASE+'#/'+r);await expect(page.locator('#app')).toBeVisible()}
});

test('offline Cue and Rehearsal retain practice controls and state',async({page,context})=>{
  await controlled(page);
  await page.evaluate(()=>{localStorage.setItem('mts.characterId','MOLLIE');localStorage.setItem('mts.selectedSceneId','act1-scene1');localStorage.removeItem('mts.practice.cue.state');localStorage.removeItem('mts.practice.rehearsal.state')});
  await context.setOffline(true);
  await page.goto(BASE+'#/cue?scene=act1-scene1');
  let f=await child(page,'008_cue_practice_P3.html');
  await f.waitForSelector('#practiceView:not([hidden])');
  const first=await f.evaluate(()=>MTS008.getState());
  expect(first.total).toBeGreaterThan(0);
  await f.click('#hintBtn');
  expect((await f.evaluate(()=>MTS008.getState())).hintLevel).toBe(1);
  await page.reload({waitUntil:'domcontentloaded'});
  f=await child(page,'008_cue_practice_P3.html');
  await f.waitForSelector('#practiceView:not([hidden])');
  expect((await f.evaluate(()=>MTS008.getState())).hintLevel).toBe(1);

  await page.goto(BASE+'#/rehearsal?scene=act1-scene1');
  f=await child(page,'009_rehearsal_P4.html');
  await f.waitForFunction(()=>MTS009&&MTS009.getState().total===190);
  await expect(f.locator('#nextBtn')).toBeVisible();
  await expect(f.locator('#pauseBtn')).toBeVisible();
  await expect(f.locator('#skipBtn')).toBeVisible();
  await expect(f.locator('#replayBtn')).toBeVisible();
  const capabilities=await f.evaluate(()=>({skip:typeof MTS009.skip,replay:typeof MTS009.replay,total:MTS009.getState().total}));
  expect(capabilities).toEqual({skip:'function',replay:'function',total:190});
});

test('PWA cache migration deletes stale/legacy caches without touching local progress',async({page})=>{
  await controlled(page);
  await page.evaluate(async()=>{
    localStorage.setItem('mts.characterId','GILES');
    localStorage.setItem('mts.sceneProgress',JSON.stringify({act2:73}));
    await caches.open('mts-private-production-v1');
    await caches.open('mts-pwa-shell-stale-build');
    await caches.open('mts-pwa-data-stale-data');
    const r=await navigator.serviceWorker.getRegistration();
    await r.unregister();
  });
  await page.reload();
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:8000});
  await expect.poll(async()=>page.evaluate(async()=>{
    const names=await caches.keys();
    return !names.includes('mts-private-production-v1')&&!names.includes('mts-pwa-shell-stale-build')&&!names.includes('mts-pwa-data-stale-data');
  })).toBe(true);
  expect(await page.evaluate(()=>localStorage.getItem('mts.characterId'))).toBe('GILES');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mts.sceneProgress')).act2)).toBe(73);
});

test('corrupted canonical data cache fails closed offline instead of using fixture/raw fallback',async({page,context})=>{
  await controlled(page);
  const name=await page.evaluate(async()=>(await caches.keys()).find(x=>x.startsWith('mts-pwa-data-')));
  expect(name).toBe(`mts-pwa-data-${DATA_VERSION}`);
  await page.evaluate(async n=>{const c=await caches.open(n);await c.put('./mousetrap_line_grammar.json',new Response('{"corrupt":true}',{headers:{'content-type':'application/json'}}))},name);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#dataGate')).toBeVisible();
  await expect(page.locator('#gateStatus')).toContainText('PRODUCTION DATA UNAVAILABLE');
});

test('missing shell cache returns explicit offline fallback',async({page,context})=>{
  await controlled(page);
  await page.evaluate(async()=>{const n=(await caches.keys()).find(x=>x.startsWith('mts-pwa-shell-')),c=await caches.open(n);await c.delete('./index.html')});
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Offline'})).toBeVisible();
});

test('mobile and tablet main routes have no horizontal overflow or page exceptions',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const size of [{width:390,height:844},{width:820,height:1180}]){
    await page.setViewportSize(size);await controlled(page);
    for(const r of ['home','script','scene','practice','progress','more','search']){await page.goto(`${BASE}#/${r}`);await expect(page.locator('#dataGate')).toBeHidden();await noOverflow(page)}
  }
  expect(errors).toEqual([]);
});
