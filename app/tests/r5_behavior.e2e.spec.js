const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';
async function ready(page){await page.goto(BASE,{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();await page.waitForFunction(()=>window.MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000})}

test('closing Line Detail returns Script to the same visible line',async({page})=>{
  await ready(page);
  const line=await page.evaluate(()=>MTS_INDEX_ZERO.store.getScene('act1-scene2')[250].id);
  await page.goto(BASE+'#/line?scene=act1-scene2&line='+line);
  await expect(page.locator('[data-close-line]')).toBeVisible();
  await page.locator('[data-close-line]').click();
  await expect(page).toHaveURL(new RegExp('#\\/script\\?line='+line+'$'));
  await page.waitForFunction(id=>{const el=document.getElementById(id);if(!el)return false;const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight},line);
});

test('Home shows bookmarks in an independently scrollable list with remove and Undo',async({page})=>{
  await ready(page);
  const ids=await page.evaluate(()=>MTS_INDEX_ZERO.store.getScene('act1-scene1').slice(0,18).map(x=>x.id));
  await page.evaluate(ids=>ids.forEach(id=>MTS_INDEX_ZERO.state.addBookmark('act1-scene1',id)),ids);
  await page.goto(BASE+'#/home');
  await expect(page.locator('[data-home-bookmark-row]')).toHaveCount(18);
  const metrics=await page.locator('[data-home-bookmark-scroll]').evaluate(el=>({scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,overflow:getComputedStyle(el).overflowY}));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);expect(['auto','scroll']).toContain(metrics.overflow);
  const pageY=await page.evaluate(()=>scrollY);
  await page.locator('[data-home-bookmark-scroll]').evaluate(el=>{el.scrollTop=120});
  expect(await page.evaluate(()=>scrollY)).toBe(pageY);
  await page.locator(`[data-home-bookmark-row="${ids[0]}"] [data-home-bookmark-remove]`).click();
  expect(await page.evaluate(id=>MTS_INDEX_ZERO.state.isBookmarked(id),ids[0])).toBe(false);
  await page.getByRole('button',{name:'Undo'}).click();
  expect(await page.evaluate(id=>MTS_INDEX_ZERO.state.isBookmarked(id),ids[0])).toBe(true);
  await page.locator(`[data-home-bookmark-row="${ids[1]}"] [data-home-bookmark-open]`).click();
  await expect(page).toHaveURL(new RegExp('#\\/line\\?scene=act1-scene1&line='+ids[1]+'$'));
});

test('selected role lines have wood-tone emphasis in Script',async({page})=>{
  await ready(page);
  await page.goto(BASE+'#/more');await page.getByRole('button',{name:/^MOLLIE/}).click();
  await page.goto(BASE+'#/script');
  const ids=await page.evaluate(()=>{const rows=[...document.querySelectorAll('[data-line]')];return {mine:rows.find(x=>x.querySelector('.speaker')?.textContent?.startsWith('MOLLIE'))?.dataset.line,other:rows.find(x=>!x.querySelector('.speaker')?.textContent?.startsWith('MOLLIE'))?.dataset.line}});
  expect(ids.mine).toBeTruthy();expect(ids.other).toBeTruthy();
  await expect(page.locator(`[data-line="${ids.mine}"]`)).toHaveClass(/selected-role-line/);
  await expect(page.locator(`[data-line="${ids.other}"]`)).not.toHaveClass(/selected-role-line/);
  const bg=await page.locator(`[data-line="${ids.mine}"]`).evaluate(el=>getComputedStyle(el).backgroundImage);expect(bg).not.toBe('none');
});

test('empty Grammar and Vocabulary sections are omitted instead of showing empty-state copy',async({page})=>{
  await ready(page);await page.evaluate(()=>MTS_INDEX_ZERO.store.loadStudy());await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy());
  const c=await page.evaluate(()=>{for(const scene of ['act1-scene1','act1-scene2','act2'])for(const speech of MTS_INDEX_ZERO.store.getScene(scene)){const g=MTS_INDEX_ZERO.store.getGrammar(speech.id),v=MTS_INDEX_ZERO.store.getVocabulary(speech.id);if(!g.length&&!v.length)return {scene,line:speech.id}}return null});
  expect(c).toBeTruthy();await page.goto(`${BASE}#/line?scene=${c.scene}&line=${c.line}`);await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy());
  await expect(page.getByRole('heading',{name:'Grammar / Usage'})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Words'})).toHaveCount(0);
  await expect(page.getByText('No additional grammar notes.')).toHaveCount(0);
  await expect(page.getByText('No vocabulary entries.')).toHaveCount(0);
});
