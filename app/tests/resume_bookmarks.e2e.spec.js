const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';

async function ready(page){
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();
  await page.waitForFunction(()=>window.MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000});
}

async function selectRole(page,role='MOLLIE'){
  await page.goto(BASE+'#/more');
  await page.locator(`button.role-card[data-role="${role}"]`).click();
}

test('Resume Continue restores the last studied location',async({page})=>{
  await ready(page);await selectRole(page,'MOLLIE');
  const line=await page.evaluate(()=>MTS_INDEX_ZERO.store.getScene('act1-scene1')[5].id);
  await page.goto(BASE+'#/line?scene=act1-scene1&line='+line);
  await page.waitForFunction(id=>MTS_INDEX_ZERO.state.latestResume()?.lineId===id,line);
  await page.goto(BASE+'#/home');
  await expect(page.getByRole('button',{name:'Continue'})).toBeVisible();
  await page.getByRole('button',{name:'Continue'}).click();
  await expect(page).toHaveURL(new RegExp('#\\/line\\?scene=act1-scene1&line='+line+'$'));
  await page.reload();await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasCore());
  expect(await page.evaluate(id=>MTS_INDEX_ZERO.state.latestResume()?.lineId===id,line)).toBe(true);
});

test('Cue Practice and Rehearsal both produce resumable state',async({page})=>{
  await ready(page);await selectRole(page,'MOLLIE');
  await page.goto(BASE+'#/cue?scene=act1-scene1');
  await expect(page.getByText(/YOUR LINE · MOLLIE/)).toBeVisible();
  await page.getByRole('button',{name:'Reveal'}).click();
  await page.getByRole('button',{name:/Got it/}).click();
  let resume=await page.evaluate(()=>MTS_INDEX_ZERO.state.resumeState().cue);
  expect(resume?.sceneId).toBe('act1-scene1');expect(resume?.role).toBe('MOLLIE');
  await page.goto(BASE+'#/rehearsal?scene=act1-scene1');
  await page.getByRole('button',{name:/Skip/}).click();
  resume=await page.evaluate(()=>MTS_INDEX_ZERO.state.resumeState().rehearsal);
  expect(resume?.sceneId).toBe('act1-scene1');expect(resume?.role).toBe('MOLLIE');
});

test('Shiori sits left of Bookmark and only the most recently pressed line stays active',async({page})=>{
  await ready(page);
  await page.goto(BASE+'#/script');
  const rows=page.locator('[data-line]');
  const first=rows.nth(0),second=rows.nth(1);
  const firstId=await first.getAttribute('data-line'),secondId=await second.getAttribute('data-line');
  await expect(first.locator('[data-shiori-toggle]')).toBeVisible();
  await expect(first.locator('[data-bookmark-toggle]')).toBeVisible();
  expect(await first.evaluate(row=>{
    const shiori=row.querySelector('[data-shiori-toggle]'),bookmark=row.querySelector('[data-bookmark-toggle]');
    return !!(shiori&&bookmark&&(shiori.compareDocumentPosition(bookmark)&Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  await first.locator('[data-shiori-toggle]').click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mts.shiori.v1')||'null')?.lineId)).toBe(firstId);
  await expect(first.locator('[data-shiori-toggle]')).toHaveAttribute('aria-pressed','true');
  await second.locator('[data-shiori-toggle]').click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mts.shiori.v1')||'null')?.lineId)).toBe(secondId);
  await expect(first.locator('[data-shiori-toggle]')).toHaveAttribute('aria-pressed','false');
  await expect(second.locator('[data-shiori-toggle]')).toHaveAttribute('aria-pressed','true');
  await page.reload();await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasCore());
  await expect(page.locator('[data-line="'+secondId+'"] [data-shiori-toggle]')).toHaveAttribute('aria-pressed','true');
  expect(await page.locator('[data-shiori-toggle][aria-pressed="true"]').count()).toBe(1);
});

test('Home Continue prefers Shiori over a newer normal resume',async({page})=>{
  await ready(page);
  await page.goto(BASE+'#/script');
  const markerLine=await page.locator('[data-line]').nth(2).getAttribute('data-line');
  await page.locator('[data-line="'+markerLine+'"] [data-shiori-toggle]').click();
  const newerLine=await page.evaluate(()=>MTS_INDEX_ZERO.store.getScene('act1-scene1')[12].id);
  await page.goto(BASE+'#/line?scene=act1-scene1&line='+newerLine);
  await page.waitForFunction(id=>MTS_INDEX_ZERO.state.latestResume()?.lineId===id,newerLine);
  await page.goto(BASE+'#/home');
  await expect(page.locator('[data-resume-home]')).toContainText('Reading marker');
  await page.getByRole('button',{name:'Continue'}).click();
  await expect(page).toHaveURL(new RegExp('#\\/script\\?line='+markerLine+'$'));
});

test('Bookmark persists, opens, deletes in one click, and supports Undo',async({page})=>{
  await ready(page);
  await page.goto(BASE+'#/script');
  const first=page.locator('[data-line]').first(),line=await first.getAttribute('data-line');
  const star=first.locator('[data-bookmark-toggle]');
  await expect(star).toBeVisible();await star.click();
  expect(await page.evaluate(id=>MTS_INDEX_ZERO.state.isBookmarked(id),line)).toBe(true);
  await page.reload();await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasCore());
  await expect(page.locator('[data-line="'+line+'"] [data-bookmark-toggle]')).toHaveText('★');
  await page.goto(BASE+'#/bookmarks');
  await expect(page.locator('[data-bookmark-row="'+line+'"]').first()).toBeVisible();
  await page.locator('[data-bookmark-row="'+line+'"] [data-bookmark-open]').click();
  await expect(page).toHaveURL(new RegExp('#\\/line\\?.*line='+line));
  await page.goto(BASE+'#/bookmarks');
  await page.locator('[data-bookmark-row="'+line+'"] [data-bookmark-remove]').click();
  expect(await page.evaluate(id=>MTS_INDEX_ZERO.state.isBookmarked(id),line)).toBe(false);
  await page.getByRole('button',{name:'Undo'}).click();
  expect(await page.evaluate(id=>MTS_INDEX_ZERO.state.isBookmarked(id),line)).toBe(true);
  await expect(page.locator('[data-bookmark-row="'+line+'"]').first()).toBeVisible();
});

test('Line Detail can set Shiori, add/remove Bookmark, and bookmark page is mobile-safe',async({page})=>{
  await ready(page);
  const line=await page.evaluate(()=>MTS_INDEX_ZERO.store.getScene('act1-scene1')[10].id);
  await page.goto(BASE+'#/line?scene=act1-scene1&line='+line);
  const shiori=page.locator('.line-detail-shiori');
  await expect(shiori).toBeVisible();await shiori.click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mts.shiori.v1')||'null')?.lineId)).toBe(line);
  const toggle=page.locator('.line-detail-bookmark');
  await expect(toggle).toBeVisible();await toggle.click();
  expect(await page.evaluate(id=>MTS_INDEX_ZERO.state.isBookmarked(id),line)).toBe(true);
  await page.goto(BASE+'#/bookmarks');
  await page.setViewportSize({width:390,height:844});
  const size=await page.evaluate(()=>({s:document.documentElement.scrollWidth,c:document.documentElement.clientWidth}));
  expect(size.s).toBeLessThanOrEqual(size.c+1);
  await page.locator('[data-bookmark-row="'+line+'"] [data-bookmark-remove]').click();
  expect(await page.evaluate(id=>MTS_INDEX_ZERO.state.isBookmarked(id),line)).toBe(false);
});

test('Bookmark page filters by scene in canonical order',async({page})=>{
  await ready(page);
  const ids=await page.evaluate(()=>[MTS_INDEX_ZERO.store.getScene('act1-scene1')[2].id,MTS_INDEX_ZERO.store.getScene('act2')[2].id]);
  await page.evaluate(([a,b])=>{MTS_INDEX_ZERO.state.addBookmark('act1-scene1',a);MTS_INDEX_ZERO.state.addBookmark('act2',b)},ids);
  await page.goto(BASE+'#/bookmarks?scene=act2');
  await expect(page.locator('[data-bookmark-row="'+ids[1]+'"]').first()).toBeVisible();
  await expect(page.locator('[data-bookmark-row="'+ids[0]+'"]').first()).toHaveCount(0);
});

test('Resume, Shiori, and Bookmark runtime survive an offline PWA reload',async({page,context})=>{
  await ready(page);
  await page.goto(BASE+'#/script');
  await page.locator('[data-line]').first().locator('[data-shiori-toggle]').click();
  const markerLine=await page.evaluate(()=>JSON.parse(localStorage.getItem('mts.shiori.v1')||'null')?.lineId);
  await page.waitForFunction(()=>!!navigator.serviceWorker?.controller,null,{timeout:12000});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000});
  const buildId=await page.evaluate(()=>MTS_INDEX_ZERO.buildId);
  await page.waitForFunction(async id=>{
    const shell=(await caches.keys()).find(x=>x===`mts-zero-shell-${id}`);
    const data=(await caches.keys()).find(x=>x===`mts-zero-data-${id}`);
    if(!shell||!data)return false;
    const sc=await caches.open(shell),dc=await caches.open(data);
    return !!(await sc.match('./src/resume-bookmarks.js'))&&!!(await dc.match('mousetrap_script_data.json'));
  },buildId,{timeout:12000});
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000});
  await page.evaluate(()=>{location.hash='#/home'});
  await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();
  await expect(page.locator('[data-resume-home]')).toContainText('Reading marker');
  await page.getByRole('button',{name:'Continue'}).click();
  await expect(page).toHaveURL(new RegExp('#\\/script\\?line='+markerLine+'$'));
  await page.evaluate(()=>{location.hash='#/bookmarks'});
  await expect(page.getByRole('heading',{name:'Bookmarks',exact:true})).toBeVisible();
  await context.setOffline(false);
});
