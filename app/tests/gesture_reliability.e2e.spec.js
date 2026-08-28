const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';
async function ready(page){
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();
  await page.waitForFunction(()=>MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000});
}
async function swipe(page,targetSelector,fromX,toX,pointerId){
  return page.evaluate(({targetSelector,fromX,toX,pointerId})=>{
    const target=document.querySelector(targetSelector);
    if(!target)throw new Error(`swipe target missing: ${targetSelector}`);
    const fire=(type,x)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId,clientX:x,clientY:260}));
    fire('pointerdown',fromX);
    fire('pointermove',(fromX+toX)/2);
    const mid={
      dragging:document.querySelector('.line-page')?.classList.contains('is-focus-swiping')||false,
      x:document.querySelector('.line-page')?.style.getPropertyValue('--focus-swipe-x')||''
    };
    fire('pointermove',toX);
    fire('pointerup',toX);
    return mid;
  },{targetSelector,fromX,toX,pointerId});
}

test('line swipe follows the pointer, works from vocabulary text after interaction, and navigates both directions',async({page})=>{
  await ready(page);
  const target=await page.evaluate(async()=>{
    await MTS_INDEX_ZERO.store.loadStudy();
    for(const scene of ['act1-scene1','act1-scene2','act2']){
      const rows=MTS_INDEX_ZERO.store.getScene(scene);
      for(let i=1;i<rows.length-1;i++){
        const vocab=MTS_INDEX_ZERO.store.getVocabulary(rows[i].id);
        if(vocab.some(v=>String(v.surface||'').trim()&&rows[i].text.toLowerCase().includes(String(v.surface).toLowerCase())))return{scene,line:rows[i].id,prev:rows[i-1].id,next:rows[i+1].id};
      }
    }
    return null;
  });
  expect(target).toBeTruthy();
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy()&&!!document.querySelector('.vocab-inline'),null,{timeout:15000});

  // Exercise an interactive control first. Closing it must not leave swipe state blocked.
  await page.locator('.vocab-inline').first().click();
  await expect(page.locator('#word-overlay')).toBeVisible();
  await page.locator('#word-close').click();
  await expect(page.locator('#word-overlay')).toBeHidden();

  const forward=await swipe(page,'.vocab-inline',310,105,71);
  expect(forward.dragging).toBe(true);
  expect(forward.x).not.toBe('');
  await expect(page).toHaveURL(new RegExp(target.next));

  const backward=await swipe(page,'.line-page',105,310,72);
  expect(backward.dragging).toBe(true);
  await expect(page).toHaveURL(new RegExp(target.line));
});

test('unrelated pointer cancellation does not kill the active line swipe',async({page})=>{
  await ready(page);
  const target=await page.evaluate(()=>{
    for(const scene of ['act1-scene1','act1-scene2','act2']){
      const rows=MTS_INDEX_ZERO.store.getScene(scene);
      if(rows.length>2)return{scene,line:rows[1].id,next:rows[2].id};
    }
    return null;
  });
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForSelector('.line-page');
  await page.evaluate(()=>{
    const p=document.querySelector('.line-page');
    p.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:81,clientX:310,clientY:250}));
    p.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:99,clientX:300,clientY:250}));
    p.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:81,clientX:180,clientY:254}));
    p.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:81,clientX:100,clientY:256}));
  });
  await expect(page).toHaveURL(new RegExp(target.next));
});
