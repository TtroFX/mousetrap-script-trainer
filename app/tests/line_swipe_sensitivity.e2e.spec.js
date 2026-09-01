const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';

async function ready(page){
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();
  await page.waitForFunction(()=>MTS_INDEX_ZERO?.store?.hasCore?.()&&MTS_LINE_NAVIGATION?.version===2,null,{timeout:12000});
}

async function routeFixture(page){
  return page.evaluate(()=>{
    for(const scene of ['act1-scene1','act1-scene2','act2']){
      const rows=MTS_INDEX_ZERO.store.getScene(scene);
      if(rows.length>5)return{scene,line:rows[2].id,next:rows[3].id};
    }
    return null;
  });
}

test('a short deliberate swipe commits without requiring a hard flick',async({page})=>{
  await ready(page);
  const target=await routeFixture(page);
  expect(target).toBeTruthy();
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForSelector('.line-page-surface');

  await page.evaluate(()=>{
    const root=document.querySelector('.line-page');
    root.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:801,clientX:330,clientY:260}));
  });
  await page.waitForTimeout(180);
  await page.evaluate(()=>{
    const root=document.querySelector('.line-page');
    root.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:801,clientX:270,clientY:263}));
  });
  await page.waitForTimeout(140);
  await page.evaluate(()=>{
    const root=document.querySelector('.line-page');
    root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:801,clientX:270,clientY:263}));
  });

  await expect(page).toHaveURL(new RegExp(target.next),{timeout:12000});
});

test('a small mostly vertical gesture still scrolls instead of changing page',async({page})=>{
  await ready(page);
  const target=await routeFixture(page);
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForSelector('.line-page-surface');
  const before=page.url();
  await page.evaluate(()=>{
    const root=document.querySelector('.line-page');
    root.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:802,clientX:260,clientY:220}));
    root.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:802,clientX:246,clientY:276}));
    root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:802,clientX:246,clientY:276}));
  });
  expect(page.url()).toBe(before);
  expect(await page.locator('.focus-page-preview').count()).toBe(0);
});

test('a new swipe supersedes the cancelled swipe settle animation',async({page})=>{
  await ready(page);
  const target=await routeFixture(page);
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForSelector('.line-page-surface');

  await page.evaluate(()=>{
    const root=document.querySelector('.line-page');
    root.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:803,clientX:330,clientY:250}));
  });
  await page.waitForTimeout(140);
  await page.evaluate(()=>{
    const root=document.querySelector('.line-page');
    root.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:803,clientX:310,clientY:251}));
  });
  await page.waitForTimeout(160);
  await page.evaluate(()=>{
    const root=document.querySelector('.line-page');
    root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:803,clientX:310,clientY:251}));
    root.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:804,clientX:330,clientY:250}));
    root.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:804,clientX:260,clientY:251}));
  });

  await page.waitForTimeout(180);
  const transform=await page.locator('.line-page-surface').evaluate(node=>getComputedStyle(node).transform);
  expect(transform).not.toBe('none');
  expect(transform).not.toBe('matrix(1, 0, 0, 1, 0, 0)');

  await page.evaluate(()=>{
    const root=document.querySelector('.line-page');
    root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:804,clientX:260,clientY:251}));
  });
  await expect(page).toHaveURL(new RegExp(target.next),{timeout:12000});
});

test('a large horizontal swipe still commits when the pointer sequence is cancelled',async({page})=>{
  await ready(page);
  const target=await routeFixture(page);
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForSelector('.line-page-surface');

  await page.evaluate(()=>{
    const root=document.querySelector('.line-page');
    root.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:805,clientX:350,clientY:260}));
    root.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:805,clientX:120,clientY:264}));
    root.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:805,clientX:120,clientY:264}));
  });

  await expect(page).toHaveURL(new RegExp(target.next),{timeout:12000});
});
