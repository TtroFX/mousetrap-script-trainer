const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';

async function ready(page){
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();
  await page.waitForFunction(()=>MTS_INDEX_ZERO?.store?.hasCore?.()&&MTS_LINE_NAVIGATION?.version===2,null,{timeout:12000});
}

test('v2 swipe follows the finger and never reveals a partially decorated destination',async({page})=>{
  await ready(page);
  const target=await page.evaluate(async()=>{
    await Promise.all([
      MTS_INDEX_ZERO.store.loadStudy(),
      MTS_INDEX_ZERO.store.loadStructure(),
      MTS_INDEX_ZERO.store.loadStageDirections()
    ]);
    for(const scene of ['act1-scene1','act1-scene2','act2']){
      const rows=MTS_INDEX_ZERO.store.getScene(scene);
      for(let i=2;i<rows.length-2;i++){
        const next=rows[i+1],entries=MTS_INDEX_ZERO.store.getStageDirectionsForSpeech(next.id)||[];
        if(entries.length){
          if(!MTS_INDEX_ZERO.state.isBookmarked(next.id))MTS_INDEX_ZERO.state.toggleBookmark(scene,next.id);
          localStorage.setItem('mts.shiori.v1',JSON.stringify({sceneId:scene,lineId:next.id,updatedAt:new Date().toISOString()}));
          return{
            scene,line:rows[i].id,next:next.id,nextText:next.text,
            actor:entries.some(entry=>entry.actorCueForSpeech===true),
            context:entries.some(entry=>entry.actorCueForSpeech!==true)
          };
        }
      }
    }
    return null;
  });
  expect(target).toBeTruthy();
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy()&&MTS_INDEX_ZERO.store.hasStructure()&&MTS_INDEX_ZERO.store.hasStageDirections(),null,{timeout:15000});
  await page.waitForSelector('.line-page');
  await page.evaluate(()=>{
    window.__v2Transitions=[];
    window.addEventListener('mts:focus-transition',event=>window.__v2Transitions.push({...event.detail}));
  });

  await page.evaluate(()=>{
    const root=document.querySelector('.line-page');
    const fire=(type,x)=>root.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:501,clientX:x,clientY:260}));
    fire('pointerdown',330);
    fire('pointermove',245);
  });
  await page.waitForSelector('.focus-page-preview');
  await page.evaluate(()=>{
    const root=document.querySelector('.line-page');
    root.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:501,clientX:120,clientY:263}));
  });

  const drag=await page.evaluate(({actor,context})=>{
    const surface=document.querySelector('.line-page-surface');
    const preview=document.querySelector('.focus-page-preview');
    return{
      surfaceTransform:getComputedStyle(surface).transform,
      previewTransform:getComputedStyle(preview).transform,
      previewText:preview.querySelector('.line-detail-text')?.textContent||'',
      bookmark:preview.querySelector('[data-bookmark-toggle]')?.textContent||'',
      shioriActive:preview.querySelector('[data-shiori-toggle]')?.classList.contains('active')||false,
      micro:!!preview.querySelector('.micro-status'),
      actorReady:!actor||!!preview.querySelector('[data-stage-actor-cues]'),
      contextReady:!context||!!preview.querySelector('[data-stage-context-details]')
    };
  },{actor:target.actor,context:target.context});
  expect(drag.surfaceTransform).not.toBe('none');
  expect(drag.previewTransform).not.toBe('none');
  expect(drag.previewText).toBe(target.nextText);
  expect(drag.bookmark).toBe('★');
  expect(drag.shioriActive).toBe(true);
  expect(drag.micro).toBe(false);
  expect(drag.actorReady).toBe(true);
  expect(drag.contextReady).toBe(true);

  await page.evaluate(()=>{
    const root=document.querySelector('.line-page');
    root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:501,clientX:120,clientY:263}));
  });
  await page.waitForFunction(()=>window.__v2Transitions?.some(event=>event.phase==='animationstart'),null,{timeout:12000});

  const during=await page.evaluate(({actor,context})=>{
    const start=[...(window.__v2Transitions||[])].reverse().find(event=>event.phase==='animationstart');
    const outgoing=document.querySelector('.line-nav-v2-overlay .line-page-surface');
    const incoming=document.querySelector('.line-nav-v2-overlay .focus-page-preview');
    const actual=document.querySelector('#app .line-page');
    const outTiming=outgoing?.getAnimations?.()[0]?.effect?.getTiming?.();
    const inTiming=incoming?.getAnimations?.()[0]?.effect?.getTiming?.();
    return{
      start,
      pending:document.documentElement.classList.contains('line-nav-v2-route-pending'),
      actualBookmark:actual?.querySelector('[data-bookmark-toggle]')?.textContent||'',
      actualShiori:actual?.querySelector('[data-shiori-toggle]')?.classList.contains('active')||false,
      actualMicro:!!actual?.querySelector('.micro-status'),
      actorReady:!actor||!!actual?.querySelector('[data-stage-actor-cues]'),
      contextReady:!context||!!actual?.querySelector('[data-stage-context-details]'),
      outDuration:outTiming?.duration,inDuration:inTiming?.duration,
      outEasing:outTiming?.easing,inEasing:inTiming?.easing
    };
  },{actor:target.actor,context:target.context});
  expect(during.pending).toBe(true);
  expect(during.actualBookmark).toBe('★');
  expect(during.actualShiori).toBe(true);
  expect(during.actualMicro).toBe(false);
  expect(during.actorReady).toBe(true);
  expect(during.contextReady).toBe(true);
  expect(during.outDuration).toBe(during.start.duration);
  expect(during.inDuration).toBe(during.start.duration);
  expect(during.outEasing).toBe(during.inEasing);
  expect(during.outEasing).toBe('cubic-bezier(0.2, 0.78, 0.2, 1)');

  await page.waitForFunction(line=>location.hash.includes(line)&&window.__v2Transitions?.some(event=>event.phase==='complete'&&event.line===line),target.next,{timeout:12000});
  await expect(page).toHaveURL(new RegExp(target.next));
  expect(await page.evaluate(()=>({
    pending:document.documentElement.classList.contains('line-nav-v2-route-pending'),
    overlay:!!document.querySelector('.line-nav-v2-overlay'),
    bookmark:document.querySelector('.line-page [data-bookmark-toggle]')?.textContent||''
  }))).toEqual({pending:false,overlay:false,bookmark:'★'});
});
