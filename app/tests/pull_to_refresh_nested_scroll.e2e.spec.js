const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';

async function ready(page){
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();
  await page.waitForFunction(()=>MTS_INDEX_ZERO?.store?.hasCore?.()&&MTS_GESTURES?.version>=11,null,{timeout:12000});
}

test('pull-to-refresh guard never blocks a direct gesture back toward the top inside the line scroller',async({page})=>{
  await ready(page);
  const target=await page.evaluate(()=>{
    const scene='act1-scene1',rows=MTS_INDEX_ZERO.store.getScene(scene);return{scene,line:rows[6].id};
  });
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForSelector('.line-page-surface');

  const result=await page.evaluate(()=>{
    const surface=document.querySelector('.line-page-surface');
    const spacer=document.createElement('div');
    spacer.style.height='1600px';spacer.style.pointerEvents='none';surface.append(spacer);
    const touchEvent=(type,y)=>{
      const event=new Event(type,{bubbles:true,cancelable:true});
      const touches=type==='touchend'||type==='touchcancel'?[]:[{clientY:y}];
      Object.defineProperty(event,'touches',{value:touches});
      Object.defineProperty(event,'changedTouches',{value:[{clientY:y}]});
      return event;
    };

    surface.scrollTop=420;
    const start=touchEvent('touchstart',220);
    const moveTowardTop=touchEvent('touchmove',300);
    surface.dispatchEvent(start);
    const allowedFromMiddle=surface.dispatchEvent(moveTowardTop);
    const preventedFromMiddle=moveTowardTop.defaultPrevented;
    surface.dispatchEvent(touchEvent('touchend',300));

    surface.scrollTop=0;
    const topStart=touchEvent('touchstart',220);
    const overscrollDown=touchEvent('touchmove',300);
    surface.dispatchEvent(topStart);
    const allowedAtTop=surface.dispatchEvent(overscrollDown);
    const preventedAtTop=overscrollDown.defaultPrevented;
    surface.dispatchEvent(touchEvent('touchend',300));

    return{
      allowedFromMiddle,preventedFromMiddle,
      allowedAtTop,preventedAtTop,
      overflowY:getComputedStyle(surface).overflowY,
      overscrollBehaviorY:getComputedStyle(surface).overscrollBehaviorY,
      windowScrollY:window.scrollY
    };
  });

  expect(result.windowScrollY).toBe(0);
  expect(result.overflowY).toBe('auto');
  expect(result.allowedFromMiddle).toBe(true);
  expect(result.preventedFromMiddle).toBe(false);
  expect(result.allowedAtTop).toBe(false);
  expect(result.preventedAtTop).toBe(true);
});
