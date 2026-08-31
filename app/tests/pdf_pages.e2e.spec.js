const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';
const LINE='act1-scene1-speech-0002';

async function ready(page){
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();
  await page.waitForFunction(()=>window.MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000});
}

async function expectPageBadge(root,pageNumber){
  const badge=root.locator(`[data-pdf-page="${pageNumber}"]`);
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(`p.${pageNumber}`);
}

test('Script canonical render shows p.3 in Full, Mine, and Cue Focus',async({page})=>{
  await ready(page);
  await page.goto(BASE+'#/script');
  let row=page.locator(`[data-line="${LINE}"]`);
  await expect(row).toBeVisible();
  await expectPageBadge(row,3);

  await page.goto(BASE+'#/more');
  await page.locator('button.role-card[data-role="MOLLIE"]').click();
  await page.goto(BASE+'#/script');
  await page.getByRole('button',{name:'Mine'}).click();
  row=page.locator(`[data-line="${LINE}"]`);
  await expect(row).toBeVisible();
  await expectPageBadge(row,3);

  await page.getByRole('button',{name:'Cue Focus'}).click();
  row=page.locator(`[data-line="${LINE}"]`);
  await expect(row).toBeVisible();
  await expectPageBadge(row,3);
});

test('Line Detail renders p.3 and compact accessible reading controls',async({page})=>{
  await ready(page);
  await page.goto(`${BASE}#/line?scene=act1-scene1&line=${LINE}`);
  const card=page.locator('.line-page .card').first();
  await expect(card.locator('.speaker-title')).toContainText('MOLLIE');
  await expect(card.locator('.line-detail-text')).toContainText('Mrs. Barlow!');
  await expectPageBadge(card,3);

  await expect(card.getByText('Reading marker',{exact:true})).toHaveCount(0);
  await expect(card.getByText('Bookmark',{exact:true})).toHaveCount(0);

  const shiori=card.locator('[data-shiori-toggle]');
  const bookmark=card.locator('[data-bookmark-toggle]');
  await expect(shiori).toBeVisible();
  await expect(shiori.locator('[data-shiori-glyph]')).toBeVisible();
  await expect(shiori).toHaveAttribute('aria-label','Set reading marker here');
  await expect(bookmark).toBeVisible();
  await expect(bookmark).toHaveText('☆');
  await expect(bookmark).toHaveAttribute('aria-label','Add bookmark');
  await expect(bookmark).toHaveAttribute('aria-pressed','false');

  await bookmark.focus();
  await page.keyboard.press('Enter');
  await expect(bookmark).toHaveText('★');
  await expect(bookmark).toHaveAttribute('aria-label','Remove bookmark');
  await expect(bookmark).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(id=>MTS_INDEX_ZERO.state.isBookmarked(id),LINE)).toBe(true);
  await page.keyboard.press('Space');
  await expect(bookmark).toHaveText('☆');
  await expect(bookmark).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(id=>MTS_INDEX_ZERO.state.isBookmarked(id),LINE)).toBe(false);

  await shiori.focus();
  await page.keyboard.press('Enter');
  await expect(shiori).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mts.shiori.v1')||'null')?.lineId)).toBe(LINE);

  const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  expect(size.scroll).toBeLessThanOrEqual(size.client+1);
});

test('Line Detail prev, next, close, and Script return remain intact',async({page})=>{
  await ready(page);
  await page.goto(`${BASE}#/line?scene=act1-scene1&line=${LINE}`);
  await page.locator('[data-next]').click();
  await expect(page).toHaveURL(/line=act1-scene1-speech-0003$/);
  await page.locator('[data-prev]').click();
  await expect(page).toHaveURL(new RegExp(`line=${LINE}$`));
  await page.locator('[data-close-line]').click();
  await expect(page).toHaveURL(new RegExp(`#\\/script\\?line=${LINE}$`));
  await expect(page.locator(`[data-line="${LINE}"]`)).toBeVisible();
  await expectPageBadge(page.locator(`[data-line="${LINE}"]`),3);
});
