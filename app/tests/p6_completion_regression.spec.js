const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';

test.beforeEach(async({page})=>{
  await page.goto(BASE);
  await expect(page.locator('#dataGate')).toBeHidden();
});

test('final production QA contract exposes all learning counts',async({page})=>{
  await expect.poll(()=>page.evaluate(()=>window.MTS_P5_QA||null)).not.toBeNull();
  expect(await page.evaluate(()=>window.MTS_P5_QA)).toEqual({
    status:'PASS',speeches:1164,scenes:[190,336,638],translations:1164,
    vocabulary:1186,grammar:692,dictionary:578
  });
});

test('Search route submits without exception and returns navigable speech results',async({page})=>{
  const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(BASE+'#/search');
  await expect(page.locator('#searchForm')).toBeVisible();
  await page.locator('#searchInput').fill('MOLLIE');
  await page.locator('#searchForm').evaluate(f=>f.requestSubmit());
  await expect(page.locator('[data-search-line]').first()).toBeVisible();
  await page.locator('[data-search-line]').first().click();
  await expect(page).toHaveURL(/#\/line\?scene=.*&line=/);
  expect(errors).toEqual([]);
});

test('Learning vocabulary preserves data-lemma compatibility selector',async({page})=>{
  await page.goto(BASE+'#/script');
  await page.locator('[data-line]').first().click();
  const frame=page.frameLocator('#learningFrame');
  await expect(frame.locator('[data-lemma]').first()).toBeVisible();
  const lemma=await frame.locator('[data-lemma]').first().getAttribute('data-lemma');
  expect(lemma).toBeTruthy();
});

test('fail-closed marker remains explicit when a required dataset is unavailable',async({browser})=>{
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.route('**/mousetrap_line_translations.json',route=>route.fulfill({status:404,body:'missing'}));
  await page.goto(BASE);
  await expect(page.locator('#dataGate')).toBeVisible();
  await expect(page.locator('#gateStatus')).toContainText('FAIL-CLOSED');
  await context.close();
});
