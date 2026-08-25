const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';

async function ready(page){
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'台本を覚える'})).toBeVisible();
  await page.waitForFunction(()=>window.MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000});
}

async function selectRole(page,role='MOLLIE'){
  await page.goto(BASE+'#/more');
  await page.getByRole('button',{name:new RegExp(`^${role}`)}).click();
  expect(await page.evaluate(()=>localStorage.getItem('mts.characterId'))).toBe(role);
}

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    localStorage.clear();
    if('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});
  });
});

test('new index boots immediately with no legacy runtime or iframe',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'台本を覚える'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Act I · Scene I を開く/})).toBeEnabled();
  const info=await page.evaluate(()=>({iframes:document.querySelectorAll('iframe').length,legacy:{private:'MTS_PRIVATE_DATA'in window,shared:'MTS_SHARED_SCRIPT_DATA'in window},zero:!!window.MTS_INDEX_ZERO}));
  expect(info).toEqual({iframes:0,legacy:{private:false,shared:false},zero:true});
  expect(errors).toEqual([]);
});

test('core has exactly 1164 speeches and Home navigation remains usable',async({page})=>{
  await ready(page);
  const counts=await page.evaluate(()=>({total:['act1-scene1','act1-scene2','act2'].reduce((n,s)=>n+MTS_INDEX_ZERO.store.getScene(s).length,0),scenes:['act1-scene1','act1-scene2','act2'].map(s=>MTS_INDEX_ZERO.store.getScene(s).length),diag:MTS_INDEX_ZERO.diagnostics()}));
  expect(counts.total).toBe(1164);expect(counts.scenes).toEqual([190,336,638]);expect(counts.diag.iframeCount).toBe(0);
  await page.getByRole('button',{name:/Act I · Scene I を開く/}).click();
  await expect(page).toHaveURL(/#\/script/);
  await expect(page.locator('[data-line]')).toHaveCount(190);
});

test('Reader Full Mine Cue Focus and role persistence',async({page})=>{
  await ready(page);await selectRole(page,'MOLLIE');
  await page.goto(BASE+'#/script');
  await expect(page.locator('[data-line]')).toHaveCount(190);
  await page.getByRole('button',{name:'Mine'}).click();
  const mine=await page.locator('[data-line]').count();expect(mine).toBeGreaterThan(0);expect(mine).toBeLessThan(190);
  await page.getByRole('button',{name:'Cue Focus'}).click();
  const cue=await page.locator('[data-line]').count();expect(cue).toBeGreaterThanOrEqual(mine);
  await page.reload();
  expect(await page.evaluate(()=>localStorage.getItem('mts.characterId'))).toBe('MOLLIE');
  expect(await page.evaluate(()=>localStorage.getItem('mts.reader.mode'))).toBe('cue');
});

test('Search opens Line Detail and study/structure load on demand',async({page})=>{
  await ready(page);
  await page.goto(BASE+'#/search?q=MOLLIE');
  await expect(page.locator('.search-result').first()).toBeVisible();
  await page.locator('.search-result').first().click();
  await expect(page).toHaveURL(/#\/line\?/);
  await expect(page.getByText('Translation',{exact:true})).toBeVisible();
  await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy()&&MTS_INDEX_ZERO.store.hasStructure(),null,{timeout:15000});
  await expect(page.getByText('Structure',{exact:true})).toBeVisible();
  await expect(page.getByText('Grammar / Usage',{exact:true})).toBeVisible();
  const d=await page.evaluate(()=>MTS_INDEX_ZERO.diagnostics().data);
  expect(d.metrics.requests).toBeLessThanOrEqual(6);
});

test('Dictionary opens from a registered vocabulary item without iframe',async({page})=>{
  await ready(page);
  const target=await page.evaluate(async()=>{await MTS_INDEX_ZERO.store.loadStudy();for(const s of ['act1-scene1','act1-scene2','act2'])for(const x of MTS_INDEX_ZERO.store.getScene(s)){const v=MTS_INDEX_ZERO.store.getVocabulary(x.id);if(v.length)return{scene:s,line:x.id}}return null});
  expect(target).toBeTruthy();
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy());
  await page.reload();await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasCore()&&MTS_INDEX_ZERO.store.hasStudy());
  const word=page.locator('[data-detail-word]').first();await expect(word).toBeVisible();await word.click();
  await expect(page.locator('#word-overlay')).toBeVisible();
  await expect(page.getByText('Word dictionary',{exact:true})).toBeVisible();
  expect(await page.locator('iframe').count()).toBe(0);
});

test('Cue Practice reveal/rating persists state and progress',async({page})=>{
  await ready(page);await selectRole(page,'MOLLIE');
  await page.goto(BASE+'#/cue?scene=act1-scene1');
  await expect(page.getByText(/YOUR LINE · MOLLIE/)).toBeVisible();
  await page.getByRole('button',{name:'Reveal'}).click();
  await page.getByRole('button',{name:/Got it/}).click();
  const saved=await page.evaluate(()=>({ratings:JSON.parse(localStorage.getItem('mts.practice.cue.ratings')||'{}'),state:JSON.parse(localStorage.getItem('mts.practice.cue.state')||'{}'),progress:JSON.parse(localStorage.getItem('mts.sceneProgress')||'{}')}));
  expect(Object.keys(saved.ratings).length).toBeGreaterThan(0);expect(saved.state['act1-scene1|MOLLIE']).toBeTruthy();expect(saved.progress['act1-scene1']).toBeGreaterThan(0);
});

test('Rehearsal keeps controls and persists position',async({page})=>{
  await ready(page);await selectRole(page,'MOLLIE');
  await page.goto(BASE+'#/rehearsal?scene=act1-scene1');
  await expect(page.getByRole('button',{name:/Pause/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Replay/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Skip/})).toBeVisible();
  await page.getByRole('button',{name:/Skip/}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('mts.practice.rehearsal.state')||'{}')['act1-scene1|MOLLIE']);
  expect(saved).toBeTruthy();expect(saved.index).toBeGreaterThanOrEqual(1);
  await page.reload();await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasCore());
  const again=await page.evaluate(()=>JSON.parse(localStorage.getItem('mts.practice.rehearsal.state')||'{}')['act1-scene1|MOLLIE']);expect(again.index).toBe(saved.index);
});

test('Progress weighting remains compatible',async({page})=>{
  await ready(page);
  await page.evaluate(()=>localStorage.setItem('mts.sceneProgress',JSON.stringify({'act1-scene1':100,'act1-scene2':50,'act2':25})));
  await page.goto(BASE+'#/progress');
  await expect(page.locator('[data-act1]')).toHaveText('68%');
  await expect(page.locator('[data-overall]')).toHaveText('44%');
});

test('core network failure never creates an infinite blocking gate',async({browser})=>{
  const context=await browser.newContext();const page=await context.newPage();
  await page.route('**/mousetrap_script_data.json',r=>r.abort());
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'台本を覚える'})).toBeVisible();
  await page.getByRole('button',{name:'Role'}).click();
  await expect(page.getByRole('heading',{name:'役を選択'})).toBeVisible();
  await page.goto(BASE+'#/script');
  await expect(page.getByText('台本データを読み込めませんでした。')).toBeVisible({timeout:12000});
  expect(await page.locator('iframe').count()).toBe(0);
  await context.close();
});

test('mobile routes have no page exceptions or horizontal overflow',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);await page.setViewportSize({width:390,height:844});
  for(const route of ['home','script','scene','practice','progress','more','search']){await page.goto(`${BASE}#/${route}`);await page.waitForTimeout(60);const size=await page.evaluate(()=>({s:document.documentElement.scrollWidth,c:document.documentElement.clientWidth}));expect(size.s).toBeLessThanOrEqual(size.c+1)}
  expect(errors).toEqual([]);
});
