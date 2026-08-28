const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';

async function ready(page){
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000});
  await page.waitForFunction(()=>window.MTS_STAGE?.diagnostics?.().loaded===true,null,{timeout:15000});
}
async function stageJson(request){
  const response=await request.get('http://127.0.0.1:4173/src/mousetrap_stage_directions.json');
  expect(response.ok()).toBeTruthy();
  return response.json();
}
const itemHash=item=>item.kind==='stage'?`#/script?stage=${encodeURIComponent(item.id)}`:`#/line?scene=${encodeURIComponent(item.sceneId)}&line=${encodeURIComponent(item.id)}`;


test('attached stage directions render above Translation with Japanese, vocabulary and notes',async({page,request})=>{
  const data=await stageJson(request),attached=data.entries.find(entry=>entry.kind==='stage-direction');
  expect(attached).toBeTruthy();
  await ready(page);
  await page.evaluate(entry=>{location.hash=`#/line?scene=${encodeURIComponent(entry.sceneId)}&line=${encodeURIComponent(entry.speechId)}`},attached);
  const card=page.locator(`[data-stage-direction="${attached.id}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator('.stage-original')).toContainText(attached.text.slice(0,40));
  await expect(card.locator('.stage-ja')).toContainText(attached.summaryJa.slice(0,30));
  const beforeTranslation=await page.evaluate(id=>{
    const stage=document.querySelector(`[data-stage-direction="${CSS.escape(id)}"]`),translation=document.querySelector('[data-translation-card]');
    return !!stage&&!!translation&&!!(stage.compareDocumentPosition(translation)&Node.DOCUMENT_POSITION_FOLLOWING);
  },attached.id);
  expect(beforeTranslation).toBe(true);
  await card.locator('summary').click();
  await expect(card.getByText(attached.vocabulary[0].surface,{exact:true})).toBeVisible();
  await expect(card.getByText(attached.vocabulary[0].meaning,{exact:true})).toBeVisible();
  await expect(card.getByText(attached.notes[0],{exact:true})).toBeVisible();
  const diagnostics=await page.evaluate(()=>MTS_STAGE.diagnostics());
  expect(diagnostics).toMatchObject({loaded:true,total:777,standalone:5,attached:772});
  expect(await page.evaluate(()=>['act1-scene1','act1-scene2','act2'].reduce((n,scene)=>n+MTS_INDEX_ZERO.store.getScene(scene).length,0))).toBe(1164);
});


test('standalone situations are Reader pages and mixed previous/next navigation follows canonical anchors',async({page,request})=>{
  const data=await stageJson(request),setting=data.entries.find(entry=>entry.kind==='scene-setting');
  expect(setting).toBeTruthy();
  await ready(page);
  await page.evaluate(entry=>{MTS_INDEX_ZERO.state.setScene(entry.sceneId);location.hash=`#/script?stage=${encodeURIComponent(entry.id)}`},setting);
  const stagePage=page.locator(`[data-stage-page="${setting.id}"]`);
  await expect(stagePage).toBeVisible();
  await expect(stagePage.locator('.stage-situation-text')).toContainText(setting.text.slice(0,40));
  await expect(stagePage.locator('.stage-situation-ja')).toContainText(setting.summaryJa.slice(0,30));
  await stagePage.locator('summary').click();
  await expect(stagePage.getByText(setting.vocabulary[0].surface,{exact:true})).toBeVisible();

  const sequence=await page.evaluate(scene=>MTS_STAGE.getReaderSequence(scene).map(item=>({kind:item.kind,sceneId:item.sceneId,id:item.id})),setting.sceneId);
  const index=sequence.findIndex(item=>item.kind==='stage'&&item.id===setting.id);
  expect(index).toBeGreaterThanOrEqual(0);
  const next=sequence[index+1];
  if(next){
    await stagePage.locator('[data-stage-next]').click();
    await page.waitForFunction(expected=>location.hash===expected,itemHash(next));
  }

  await page.evaluate(scene=>{MTS_INDEX_ZERO.state.setScene(scene);location.hash='#/script'},setting.sceneId);
  await expect(page.locator(`[data-stage-open="${setting.id}"]`)).toBeVisible();
});


test('stage directions remain available after complete offline reload',async({page,context,request})=>{
  const data=await stageJson(request),attached=data.entries.find(entry=>entry.kind==='stage-direction'&&entry.vocabulary?.length&&entry.notes?.length);
  await ready(page);
  await page.evaluate(async()=>{await window.MTS_PWA_READY;await window.MTS_STAGE.ready});
  await page.waitForFunction(async()=>!!(await caches.match(new URL('./src/mousetrap_stage_directions.json',location.href).href)),null,{timeout:30000});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:10000});
  await page.waitForFunction(()=>window.MTS_STAGE?.diagnostics?.().loaded===true,null,{timeout:15000});
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MTS_STAGE?.diagnostics?.().loaded===true,null,{timeout:15000});
  await page.evaluate(entry=>{location.hash=`#/line?scene=${encodeURIComponent(entry.sceneId)}&line=${encodeURIComponent(entry.speechId)}`},attached);
  await expect(page.locator(`[data-stage-direction="${attached.id}"]`)).toBeVisible();
  await expect(page.locator('[data-translation-card]')).toBeVisible();
});
