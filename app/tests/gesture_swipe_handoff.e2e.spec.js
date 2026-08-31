const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';

async function ready(page){
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();
  await page.waitForFunction(()=>MTS_INDEX_ZERO?.store?.hasCore?.()&&MTS_FOCUS_SWIPE_HANDOFF?.version===1,null,{timeout:12000});
}

test('committed swipe keeps the old page and preview continuous with the destination easing',async({page})=>{
  await ready(page);
  const target=await page.evaluate(()=>{
    const rows=MTS_INDEX_ZERO.store.getScene('act1-scene1');
    return{scene:'act1-scene1',line:rows[4].id,next:rows[5].id,oldText:rows[4].text,nextText:rows[5].text};
  });
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForSelector('.line-page');
  await page.evaluate(()=>{
    window.__handoffEvents=[];
    window.addEventListener('mts:focus-swipe-handoff',event=>window.__handoffEvents.push({...event.detail}));
  });

  await page.evaluate(()=>{
    const root=document.querySelector('.line-page');
    const fire=(type,x)=>root.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:401,clientX:x,clientY:260}));
    fire('pointerdown',320);
    fire('pointermove',235);
    fire('pointermove',125);
    fire('pointerup',125);
  });

  await page.waitForFunction(()=>window.__handoffEvents?.some(event=>event.phase==='start'),null,{timeout:8000});
  const during=await page.evaluate(()=>{
    const event=[...(window.__handoffEvents||[])].reverse().find(item=>item.phase==='start');
    const exit=document.querySelector('.focus-swipe-exit-surface');
    const preview=document.querySelector('.focus-swipe-preview-surface');
    const incoming=document.querySelector('.line-page-surface.is-focus-entering');
    const exitTiming=exit?.getAnimations?.()[0]?.effect?.getTiming?.();
    const previewTiming=preview?.getAnimations?.()[0]?.effect?.getTiming?.();
    return{
      event,
      exitText:exit?.querySelector('.line-detail-text')?.textContent||'',
      previewText:preview?.querySelector('.line-detail-text')?.textContent||'',
      incomingText:incoming?.querySelector('.line-detail-text')?.textContent||'',
      exitDuration:exitTiming?.duration,
      exitEasing:exitTiming?.easing,
      previewDuration:previewTiming?.duration,
      previewEasing:previewTiming?.easing,
      handoffCount:document.querySelectorAll('.focus-swipe-handoff-layer').length
    };
  });
  expect(during.handoffCount).toBe(1);
  expect(during.exitText).toBe(target.oldText);
  expect(during.previewText).toBe(target.nextText);
  expect(during.incomingText).toBe(target.nextText);
  expect(during.exitDuration).toBe(during.event.duration);
  expect(during.previewDuration).toBe(during.event.duration);
  expect(during.exitEasing).toBe(during.event.easing);
  expect(during.previewEasing).toBe(during.event.easing);
  expect(during.event.easing).toBe('cubic-bezier(0.2, 0.78, 0.2, 1)');

  await page.waitForFunction(line=>location.hash.includes(line)&&!document.querySelector('.focus-swipe-handoff-layer'),target.next,{timeout:8000});
  await expect(page).toHaveURL(new RegExp(target.next));
});
