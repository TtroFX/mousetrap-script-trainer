const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';
async function ready(page){await page.goto(BASE,{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();await page.waitForFunction(()=>window.MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000});await page.evaluate(()=>MTS_INDEX_ZERO.store.loadStudy());await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy(),null,{timeout:12000})}

test('interpretation is rendered quietly inside the Translation card and omitted when empty',async({page})=>{
  await ready(page);
  const target=await page.evaluate(()=>{for(const scene of ['act1-scene1','act1-scene2','act2'])for(const speech of MTS_INDEX_ZERO.store.getScene(scene)){if(MTS_INDEX_ZERO.store.getInterpretation(speech.id).length)return {scene,line:speech.id}}});
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy());
  const interpretation=page.locator('.translation-interpretation');await expect(interpretation).toBeVisible();
  const translationCard=page.getByText('Translation',{exact:true}).locator('..');expect(await translationCard.locator('.translation-interpretation').count()).toBe(1);
  const sizes=await page.evaluate(()=>({translation:parseFloat(getComputedStyle(document.querySelector('.translation')).fontSize),interpretation:parseFloat(getComputedStyle(document.querySelector('.translation-interpretation')).fontSize)}));expect(sizes.interpretation).toBeLessThan(sizes.translation);
  const empty=await page.evaluate(()=>{for(const scene of ['act1-scene1','act1-scene2','act2'])for(const speech of MTS_INDEX_ZERO.store.getScene(scene)){if(!MTS_INDEX_ZERO.store.getInterpretation(speech.id).length)return {scene,line:speech.id}}});
  await page.goto(`${BASE}#/line?scene=${empty.scene}&line=${empty.line}`);await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy());await expect(page.locator('.translation-interpretation')).toHaveCount(0);
});

test('truth-aware kinds can display a compact badge and interpretation text is searchable',async({page})=>{
  await ready(page);
  const target=await page.evaluate(()=>{const special=new Set(['foreshadowing','truth','lie','concealment','feignedIgnorance','misdirection','evasion','mistakenBelief']);for(const scene of ['act1-scene1','act1-scene2','act2'])for(const speech of MTS_INDEX_ZERO.store.getScene(scene)){const note=MTS_INDEX_ZERO.store.getInterpretation(speech.id).find(x=>special.has(x.kind));if(note)return {scene,line:speech.id,needle:note.text.slice(0,12)}}});
  expect(target).toBeTruthy();await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy());await expect(page.locator('.interpretation-badge')).toBeVisible();
  await page.goto(`${BASE}#/search?q=${encodeURIComponent(target.needle)}`);await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy());await expect(page.getByText('Interpretation',{exact:true}).first()).toBeVisible();
});
