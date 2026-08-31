const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';

async function ready(page){
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();
  await page.waitForFunction(()=>MTS_INDEX_ZERO?.store?.hasCore?.()&&MTS_LINE_NAVIGATION?.version===2&&MTS_LINE_SCROLL?.version===1,null,{timeout:12000});
}

async function swipe(page,fromX,toX,pointerId,y=300){
  await page.evaluate(({fromX,toX,pointerId,y})=>{
    const surface=document.querySelector('.line-page-surface');
    if(!surface)throw new Error('line surface missing');
    const fire=(type,x,yy)=>surface.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId,clientX:x,clientY:yy}));
    fire('pointerdown',fromX,y);
    fire('pointermove',(fromX+toX)/2,y+2);
    fire('pointermove',toX,y+3);
    fire('pointerup',toX,y+3);
  },{fromX,toX,pointerId,y});
}

test('adjacent line pages keep independent vertical scroll positions while horizontal swipe stays finger-locked',async({page})=>{
  await ready(page);
  const target=await page.evaluate(()=>{
    for(const scene of ['act1-scene1','act1-scene2','act2']){
      const rows=MTS_INDEX_ZERO.store.getScene(scene);
      if(rows.length>5)return{scene,line:rows[2].id,next:rows[3].id};
    }
    return null;
  });
  expect(target).toBeTruthy();
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForSelector('.line-page-surface');
  await page.waitForFunction(()=>MTS_LINE_SCROLL?.version===1&&document.querySelector('.line-page-surface')?.clientHeight>150);

  await page.evaluate(()=>{
    const surface=document.querySelector('.line-page-surface');
    const spacer=document.createElement('div');
    spacer.dataset.independentScrollSpacer='source';spacer.style.height='1400px';spacer.style.pointerEvents='none';
    surface.append(spacer);surface.scrollTop=420;surface.dispatchEvent(new Event('scroll'));
  });
  await page.waitForFunction(()=>Math.abs((document.querySelector('.line-page-surface')?.scrollTop||0)-420)<3);

  await page.evaluate(()=>{
    const surface=document.querySelector('.line-page-surface');
    const fire=(type,x)=>surface.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:701,clientX:x,clientY:300}));
    fire('pointerdown',330);fire('pointermove',245);fire('pointermove',125);
  });
  await page.waitForSelector('.focus-page-preview');
  const drag=await page.evaluate(()=>{
    const surface=document.querySelector('.line-page-surface');
    const preview=document.querySelector('.focus-page-preview');
    return{
      sourceTop:surface.scrollTop,
      previewTop:preview.scrollTop,
      sourceTransform:getComputedStyle(surface).transform,
      previewTransform:getComputedStyle(preview).transform,
      sourceOverflow:getComputedStyle(surface).overflowY,
      previewOverflow:getComputedStyle(preview).overflowY,
      sameScroller:surface===preview
    };
  });
  expect(drag.sourceTop).toBeGreaterThan(400);
  expect(drag.previewTop).toBeLessThan(3);
  expect(drag.sourceTransform).not.toBe('none');
  expect(drag.previewTransform).not.toBe('none');
  expect(drag.sourceOverflow).toBe('auto');
  expect(drag.previewOverflow).toBe('auto');
  expect(drag.sameScroller).toBe(false);

  await page.evaluate(()=>{
    const surface=document.querySelector('.line-page-surface');
    surface.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:701,clientX:125,clientY:303}));
  });
  await expect(page).toHaveURL(new RegExp(target.next));
  await page.waitForFunction(line=>location.hash.includes(line)&&!document.querySelector('.line-nav-v2-overlay'),target.next,{timeout:12000});
  expect(await page.evaluate(()=>document.querySelector('.line-page-surface')?.scrollTop||0)).toBeLessThan(3);

  await page.evaluate(()=>{
    const surface=document.querySelector('.line-page-surface');
    const spacer=document.createElement('div');
    spacer.dataset.independentScrollSpacer='next';spacer.style.height='1200px';spacer.style.pointerEvents='none';
    surface.append(spacer);surface.scrollTop=180;surface.dispatchEvent(new Event('scroll'));
  });
  await page.waitForFunction(()=>Math.abs((document.querySelector('.line-page-surface')?.scrollTop||0)-180)<3);

  await page.evaluate(()=>{
    const surface=document.querySelector('.line-page-surface');
    const fire=(type,x)=>surface.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:702,clientX:x,clientY:300}));
    fire('pointerdown',120);fire('pointermove',205);fire('pointermove',330);
  });
  await page.waitForSelector('.focus-page-preview');
  const backDrag=await page.evaluate(()=>({
    currentTop:document.querySelector('.line-page-surface')?.scrollTop||0,
    previousTop:document.querySelector('.focus-page-preview')?.scrollTop||0,
    currentTransform:getComputedStyle(document.querySelector('.line-page-surface')).transform,
    previousTransform:getComputedStyle(document.querySelector('.focus-page-preview')).transform
  }));
  expect(backDrag.currentTop).toBeGreaterThan(160);
  expect(backDrag.previousTop).toBeGreaterThan(400);
  expect(backDrag.currentTransform).not.toBe('none');
  expect(backDrag.previousTransform).not.toBe('none');

  await page.evaluate(()=>{
    const surface=document.querySelector('.line-page-surface');
    surface.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:702,clientX:330,clientY:303}));
  });
  await expect(page).toHaveURL(new RegExp(target.line));
  await page.waitForFunction(line=>location.hash.includes(line)&&!document.querySelector('.line-nav-v2-overlay'),target.line,{timeout:12000});
  expect(await page.evaluate(()=>document.querySelector('.line-page-surface')?.scrollTop||0)).toBeGreaterThan(400);
});

test('vertical gesture remains native scroll and does not start horizontal page motion',async({page})=>{
  await ready(page);
  const target=await page.evaluate(()=>{
    const scene='act1-scene1',rows=MTS_INDEX_ZERO.store.getScene(scene);return{scene,line:rows[4].id};
  });
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForSelector('.line-page-surface');
  const result=await page.evaluate(()=>{
    const surface=document.querySelector('.line-page-surface');
    const spacer=document.createElement('div');spacer.style.height='1300px';surface.append(spacer);
    surface.scrollTop=220;surface.dispatchEvent(new Event('scroll'));
    const down=new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:703,clientX:240,clientY:360});
    const move=new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:703,clientX:244,clientY:250});
    const up=new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:703,clientX:246,clientY:220});
    surface.dispatchEvent(down);surface.dispatchEvent(move);surface.dispatchEvent(up);
    return{transform:getComputedStyle(surface).transform,preview:!!document.querySelector('.focus-page-preview'),hash:location.hash,top:surface.scrollTop};
  });
  expect(result.transform).toBe('none');
  expect(result.preview).toBe(false);
  expect(result.hash).toContain(target.line);
  expect(result.top).toBeGreaterThan(200);
});
