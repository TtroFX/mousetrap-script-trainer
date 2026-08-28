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
    const surface=document.querySelector('.line-page-surface');
    const preview=document.querySelector('.focus-page-preview');
    const mid={
      dragging:surface?.classList.contains('is-focus-swiping')||false,
      transform:surface?getComputedStyle(surface).transform:'none',
      preview:!!preview,
      previewTransform:preview?getComputedStyle(preview).transform:'none'
    };
    fire('pointermove',toX);
    fire('pointerup',toX);
    const liveSurface=document.querySelector('.line-page-surface');
    const livePreview=document.querySelector('.focus-page-preview');
    return {
      mid,
      commitAnimations:(liveSurface?.getAnimations?.().length||0)+(livePreview?.getAnimations?.().length||0),
      settling:liveSurface?.classList.contains('is-focus-settling')||false,
      previewSettling:livePreview?.classList.contains('is-focus-settling')||false
    };
  },{targetSelector,fromX,toX,pointerId});
}
async function doubleTap(page,direction){
  return page.evaluate(direction=>{
    const root=document.querySelector('.line-page');
    const target=root?.querySelector('.line-detail-text')||root;
    if(!root||!target)throw new Error('line page missing');
    const rect=root.getBoundingClientRect();
    const x=direction>0?rect.left+rect.width*.78:rect.left+rect.width*.22;
    const y=Math.max(rect.top+80,180);
    const fire=(type,id)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:id,clientX:x,clientY:y}));
    fire('pointerdown',91);fire('pointerup',91);
    fire('pointerdown',92);fire('pointerup',92);
    const surface=document.querySelector('.line-page-surface');
    const preview=document.querySelector('.focus-page-preview');
    return{
      preview:!!preview,
      previewText:preview?.querySelector('.line-detail-text')?.textContent||'',
      animations:(surface?.getAnimations?.().length||0)+(preview?.getAnimations?.().length||0)
    };
  },direction);
}

test('line swipe follows the pointer, exposes the destination page, and navigates both directions',async({page})=>{
  await ready(page);
  const target=await page.evaluate(async()=>{
    await MTS_INDEX_ZERO.store.loadStudy();
    for(const scene of ['act1-scene1','act1-scene2','act2']){
      const rows=MTS_INDEX_ZERO.store.getScene(scene);
      for(let i=1;i<rows.length-1;i++){
        const vocab=MTS_INDEX_ZERO.store.getVocabulary(rows[i].id);
        if(vocab.some(v=>String(v.surface||'').trim()&&rows[i].text.toLowerCase().includes(String(v.surface).toLowerCase())))return{scene,line:rows[i].id,prev:rows[i-1].id,next:rows[i+1].id,nextText:rows[i+1].text};
      }
    }
    return null;
  });
  expect(target).toBeTruthy();
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy()&&!!document.querySelector('.vocab-inline'),null,{timeout:15000});

  await page.locator('.vocab-inline').first().click();
  await expect(page.locator('#word-overlay')).toBeVisible();
  await page.locator('#word-close').click();
  await expect(page.locator('#word-overlay')).toBeHidden();

  const forward=await swipe(page,'.vocab-inline',310,105,71);
  expect(forward.mid.dragging).toBe(true);
  expect(forward.mid.transform).not.toBe('none');
  expect(forward.mid.preview).toBe(true);
  expect(forward.mid.previewTransform).not.toBe('none');
  expect(forward.settling).toBe(true);
  expect(forward.previewSettling).toBe(true);
  expect(forward.commitAnimations).toBeGreaterThan(1);
  await expect(page).toHaveURL(new RegExp(target.next));

  const backward=await swipe(page,'.line-page',105,310,72);
  expect(backward.mid.dragging).toBe(true);
  expect(backward.mid.preview).toBe(true);
  expect(backward.commitAnimations).toBeGreaterThan(1);
  await expect(page).toHaveURL(new RegExp(target.line));
});

test('floating previous close next controller stays viewport-fixed while the line page scrolls',async({page})=>{
  await page.setViewportSize({width:390,height:600});
  await ready(page);
  const target=await page.evaluate(async()=>{
    await MTS_INDEX_ZERO.store.loadStudy();
    const rows=MTS_INDEX_ZERO.store.getScene('act1-scene1');
    return{scene:'act1-scene1',line:rows[Math.min(8,rows.length-2)].id};
  });
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForSelector('.line-page .floating-nav');
  await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy(),null,{timeout:15000});
  await page.evaluate(()=>{
    if(document.body.scrollHeight<=innerHeight+100){
      const root=document.querySelector('.line-page-surface')||document.querySelector('.line-page');
      const spacer=document.createElement('div');
      spacer.dataset.fixedNavScrollTest='true';
      spacer.style.height='1000px';
      spacer.style.pointerEvents='none';
      root.append(spacer);
    }
  });
  await page.waitForFunction(()=>document.body.scrollHeight>innerHeight+100,null,{timeout:3000});
  const before=await page.locator('.floating-nav').boundingBox();
  expect(before).toBeTruthy();
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(20);
  const after=await page.locator('.floating-nav').boundingBox();
  expect(after).toBeTruthy();
  expect(Math.abs(after.y-before.y)).toBeLessThan(2);
  expect(Math.abs(after.x-before.x)).toBeLessThan(2);
});

test('right and left double-tap page turns use the same visible destination transition',async({page})=>{
  await ready(page);
  const target=await page.evaluate(()=>{
    const rows=MTS_INDEX_ZERO.store.getScene('act1-scene1');
    return{scene:'act1-scene1',line:rows[2].id,prev:rows[1].id,next:rows[3].id,nextText:rows[3].text,prevText:rows[1].text};
  });
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForSelector('.line-page');
  const forward=await doubleTap(page,1);
  expect(forward.preview).toBe(true);
  expect(forward.previewText).toBe(target.nextText);
  expect(forward.animations).toBeGreaterThan(1);
  await expect(page).toHaveURL(new RegExp(target.next));

  const backward=await doubleTap(page,-1);
  expect(backward.preview).toBe(true);
  expect(backward.previewText).toBe(target.line?await page.evaluate(({scene,line})=>MTS_INDEX_ZERO.store.getSpeech(scene,line).text,{scene:target.scene,line:target.line}):'');
  expect(backward.animations).toBeGreaterThan(1);
  await expect(page).toHaveURL(new RegExp(target.line));
});

test('previous and next buttons animate with destination page visible before navigation',async({page})=>{
  await ready(page);
  const target=await page.evaluate(()=>{
    const rows=MTS_INDEX_ZERO.store.getScene('act1-scene1');
    return{scene:'act1-scene1',line:rows[4].id,next:rows[5].id,nextText:rows[5].text};
  });
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForSelector('[data-next]');
  const result=await page.evaluate(()=>{
    const button=document.querySelector('[data-next]');
    button.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
    const surface=document.querySelector('.line-page-surface');
    const preview=document.querySelector('.focus-page-preview');
    return{
      preview:!!preview,
      previewText:preview?.querySelector('.line-detail-text')?.textContent||'',
      animations:(surface?.getAnimations?.().length||0)+(preview?.getAnimations?.().length||0)
    };
  });
  expect(result.preview).toBe(true);
  expect(result.previewText).toBe(target.nextText);
  expect(result.animations).toBeGreaterThan(1);
  await expect(page).toHaveURL(new RegExp(target.next));
});

test('reduced-motion preference still keeps short visible swipe feedback instead of disabling motion completely',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await ready(page);
  const target=await page.evaluate(()=>{
    const rows=MTS_INDEX_ZERO.store.getScene('act1-scene1');
    return{scene:'act1-scene1',line:rows[1].id,next:rows[2].id};
  });
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForSelector('.line-page');
  const result=await swipe(page,'.line-page',310,105,73);
  expect(result.mid.dragging).toBe(true);
  expect(result.mid.preview).toBe(true);
  expect(result.commitAnimations).toBeGreaterThan(1);
  await expect(page).toHaveURL(new RegExp(target.next));
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
