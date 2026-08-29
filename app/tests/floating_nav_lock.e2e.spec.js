const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';

async function ready(page){
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();
  await page.waitForFunction(()=>MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000});
  await page.evaluate(async()=>{await MTS_INDEX_ZERO.store.loadStudy();if(document.fonts?.ready)await document.fonts.ready;return true});
}

async function controllerRects(page){
  return page.evaluate(()=>{
    const read=selector=>{
      const element=document.querySelector(selector);
      if(!element)return null;
      const r=element.getBoundingClientRect();
      return{x:r.x,y:r.y,width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom};
    };
    return{
      nav:read('.floating-nav'),
      prev:read('[data-prev]'),
      close:read('[data-close-line]'),
      next:read('[data-next]')
    };
  });
}

function expectSameRect(actual,expected,tolerance=.75){
  expect(actual).toBeTruthy();
  expect(expected).toBeTruthy();
  for(const key of ['x','y','width','height','left','top','right','bottom']){
    expect(Math.abs(actual[key]-expected[key]),`${key} changed from ${expected[key]} to ${actual[key]}`).toBeLessThanOrEqual(tolerance);
  }
}

function expectSameController(actual,expected,tolerance=.75){
  for(const key of ['nav','prev','close','next'])expectSameRect(actual[key],expected[key],tolerance);
}

test('floating previous close next controller does not move while pressed or after page navigation',async({page})=>{
  await page.setViewportSize({width:390,height:640});
  await ready(page);
  const target=await page.evaluate(()=>{
    const rows=MTS_INDEX_ZERO.store.getScene('act1-scene1');
    const index=Math.min(6,rows.length-3);
    return{scene:'act1-scene1',line:rows[index].id,next:rows[index+1].id};
  });
  await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
  await page.waitForSelector('.line-page .floating-nav');
  await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy(),null,{timeout:15000});
  await page.evaluate(async()=>{if(document.fonts?.ready)await document.fonts.ready});

  const before=await controllerRects(page);
  const next=page.locator('[data-next]');
  const nextBox=await next.boundingBox();
  expect(nextBox).toBeTruthy();
  await page.mouse.move(nextBox.x+nextBox.width/2,nextBox.y+nextBox.height/2);
  await page.mouse.down();
  await expect(next).toBeVisible();
  const duringPress=await controllerRects(page);
  expectSameController(duringPress,before);

  await page.mouse.up();
  await expect(page).toHaveURL(new RegExp(target.next));
  await page.waitForSelector('.line-page .floating-nav');
  const afterNext=await controllerRects(page);
  expectSameController(afterNext,before);

  const prev=page.locator('[data-prev]');
  const prevBox=await prev.boundingBox();
  expect(prevBox).toBeTruthy();
  await page.mouse.move(prevBox.x+prevBox.width/2,prevBox.y+prevBox.height/2);
  await page.mouse.down();
  const duringBackPress=await controllerRects(page);
  expectSameController(duringBackPress,before);
  await page.mouse.up();
  await expect(page).toHaveURL(new RegExp(target.line));
  const afterBack=await controllerRects(page);
  expectSameController(afterBack,before);
});

test('controller stays viewport-fixed at page top middle and bottom on mobile and desktop',async({page})=>{
  for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
    await page.setViewportSize(viewport);
    await ready(page);
    const target=await page.evaluate(()=>{const rows=MTS_INDEX_ZERO.store.getScene('act1-scene2');return{scene:'act1-scene2',line:rows[8].id,next:rows[9].id}});
    await page.goto(`${BASE}#/line?scene=${target.scene}&line=${target.line}`);
    await page.waitForSelector('.line-page .floating-nav');
    await page.evaluate(()=>{const root=document.querySelector('.line-page-surface')||document.querySelector('.line-page');const spacer=document.createElement('div');spacer.style.height='1800px';spacer.style.pointerEvents='none';root.append(spacer);window.scrollTo(0,0)});
    const top=await controllerRects(page);
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight/2));
    const middle=await controllerRects(page);
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    const bottom=await controllerRects(page);
    expectSameController(middle,top);
    expectSameController(bottom,top);
    const bounds=await page.evaluate(()=>{const r=document.querySelector('.floating-nav').getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,position:getComputedStyle(document.querySelector('.floating-nav')).position,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}});
    expect(bounds.position).toBe('fixed');
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
    expect(bounds.overflow).toBeLessThanOrEqual(1);
    await page.locator('[data-next]').click();
    await expect(page).toHaveURL(new RegExp(target.next));
  }
});
