const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';
async function ready(page){await page.goto(BASE,{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();await page.waitForFunction(()=>window.MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000})}

test('new index boots immediately with no legacy runtime or iframe',async({page})=>{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();
  expect(await page.locator('iframe').count()).toBe(0);
  expect(await page.evaluate(()=>({old:typeof MTS_PRIVATE_DATA,shared:Object.keys(window).filter(k=>k.startsWith('MTS_SHARED_')).length}))).toEqual({old:'undefined',shared:0});
});

test('core has exactly 1164 speeches and Home navigation remains usable',async({page})=>{
  await ready(page);
  const d=await page.evaluate(()=>MTS_INDEX_ZERO.diagnostics().data);
  expect(d.counts.speeches).toBe(1164);
  await page.getByRole('button',{name:/Open Act I/}).click();
  await expect(page).toHaveURL(/#\/script/);
  await expect(page.locator('[data-line]').first()).toBeVisible();
});

test('Reader Full Mine Cue Focus and role persistence',async({page})=>{
  await ready(page);
  await page.goto(BASE+'#/more');
  await page.getByRole('button',{name:/^MOLLIE/}).click();
  await page.goto(BASE+'#/script');
  await page.getByRole('button',{name:'Mine'}).click();
  await expect(page.locator('[data-line]').first()).toBeVisible();
  expect(await page.locator('[data-line]').count()).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Cue Focus'}).click();
  await expect(page.locator('.cue-row').first()).toBeVisible();
  await expect(page.locator('.target-row').first()).toBeVisible();
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
  const grammarCount=await page.evaluate(()=>{const q=new URLSearchParams(location.hash.split('?')[1]||'');return MTS_INDEX_ZERO.store.getGrammar(q.get('line')).length});
  if(grammarCount)await expect(page.getByText('Grammar / Usage',{exact:true})).toBeVisible();
  else await expect(page.getByText('Grammar / Usage',{exact:true})).toHaveCount(0);
  const d=await page.evaluate(()=>MTS_INDEX_ZERO.diagnostics().data);
  expect(d.metrics.requests).toBeLessThanOrEqual(6);
});

test('Dictionary opens from a registered vocabulary item without iframe',async({page})=>{
  await ready(page);
  await page.goto(BASE+'#/search?q=MOLLIE');
  await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy(),null,{timeout:15000});
  await page.goto(BASE+'#/script');
  const word=page.locator('[data-word-line]').first();
  await expect(word).toBeVisible();
  await word.click();
  await expect(page.locator('#word-overlay')).toBeVisible();
  await expect(page.getByText('Word dictionary',{exact:true})).toBeVisible();
  expect(await page.locator('#word-overlay iframe').count()).toBe(0);
});

test('Cue Practice reveal/rating persists state and progress',async({page})=>{
  await ready(page);
  await page.goto(BASE+'#/more');await page.getByRole('button',{name:/^MOLLIE/}).click();
  await page.goto(BASE+'#/cue?scene=act1-scene1');
  await expect(page.getByText(/YOUR LINE · MOLLIE/)).toBeVisible();
  await page.getByRole('button',{name:'Reveal'}).click();
  await expect(page.getByRole('button',{name:/Got it/})).toBeVisible();
  await page.getByRole('button',{name:/Got it/}).click();
  const count=await page.evaluate(()=>Object.keys(MTS_INDEX_ZERO.state.cueRatings()).length);
  expect(count).toBeGreaterThan(0);
});

test('Rehearsal keeps controls and persists position',async({page})=>{
  await ready(page);
  await page.goto(BASE+'#/more');await page.getByRole('button',{name:/^MOLLIE/}).click();
  await page.goto(BASE+'#/rehearsal?scene=act1-scene1');
  await expect(page.getByRole('button',{name:/Skip/})).toBeVisible();
  await page.getByRole('button',{name:/Skip/}).click();
  const saved=await page.evaluate(()=>Object.keys(MTS_INDEX_ZERO.state.rehearsalStates()).length);
  expect(saved).toBeGreaterThan(0);
});

test('Progress weighting remains compatible',async({page})=>{
  await ready(page);
  await page.evaluate(()=>{MTS_INDEX_ZERO.state.setSceneProgress('act1-scene1',100);MTS_INDEX_ZERO.state.setSceneProgress('act1-scene2',0);MTS_INDEX_ZERO.state.setSceneProgress('act2',50)});
  await page.goto(BASE+'#/progress');
  await expect(page.locator('[data-act1]')).toHaveText('36%');
  await expect(page.locator('[data-act2]')).toHaveText('50%');
  await expect(page.locator('[data-overall]')).toHaveText('44%');
});

test('core network failure never creates an infinite blocking gate',async({page})=>{
  await page.route('**/mousetrap_script_data.json',route=>route.abort());
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();
  await page.goto(BASE+'#/script');
  await expect(page.getByText(/Script data could not be loaded|Loading script/)).toBeVisible({timeout:12000});
  expect(await page.locator('#dataGate').count()).toBe(0);
});

test('mobile routes have no page exceptions or horizontal overflow',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});
  await ready(page);
  for(const route of ['#/home','#/script','#/search?q=MOLLIE','#/progress','#/more']){await page.goto(BASE+route);await page.waitForTimeout(80)}
  const size=await page.evaluate(()=>({s:document.documentElement.scrollWidth,c:document.documentElement.clientWidth}));
  expect(size.s).toBeLessThanOrEqual(size.c+1);expect(errors).toEqual([]);
});
