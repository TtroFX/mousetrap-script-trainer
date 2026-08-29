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

test('Script Full renders the exact ordered speech and stage-direction stream',async({page,request})=>{
  const data=await stageJson(request),scene='act1-scene1';
  await ready(page);
  await page.evaluate(scene=>{MTS_INDEX_ZERO.state.setScene(scene);MTS_INDEX_ZERO.state.setReaderMode('full');location.hash='#/script'},scene);
  await page.waitForFunction(()=>document.querySelector('.reader-list')?.dataset.stageEnhanced==='true');
  await expect(page.locator('[data-line]')).toHaveCount(190);
  await expect(page.locator('[data-stage-reader]')).toHaveCount(185);
  expect(await page.locator('[data-stage-reader] .speaker').count()).toBe(0);
  const actual=await page.evaluate(()=>[...document.querySelector('.reader-list').children].map(node=>node.dataset.line?`speech:${node.dataset.line}`:`stage:${node.dataset.stageReader}`));
  const expected=await page.evaluate(scene=>MTS_STAGE.getReaderSequence(scene).map(item=>`${item.kind}:${item.id}`),scene);
  expect(actual).toEqual(expected);
  expect(expected.length).toBe(375);
  const sourceOrders=await page.evaluate(scene=>MTS_STAGE.getReaderSequence(scene).filter(item=>item.kind==='stage').map(item=>item.stage.sourceOrder),scene);
  expect(sourceOrders).toEqual(Array.from({length:185},(_,index)=>index+1));
  expect(data.entries.filter(entry=>entry.sceneId===scene).map(entry=>entry.id)).toEqual(sourceOrders.map(order=>data.entries.find(entry=>entry.sceneId===scene&&entry.sourceOrder===order).id));
});

test('Line Detail shows nearby stage context before Translation without changing dialogue counts',async({page,request})=>{
  const data=await stageJson(request),attached=data.entries.find(entry=>entry.kind==='stage-direction'&&entry.vocabulary?.length&&entry.notes?.length);
  expect(attached).toBeTruthy();
  await ready(page);
  await page.evaluate(entry=>{location.hash=`#/line?scene=${encodeURIComponent(entry.sceneId)}&line=${encodeURIComponent(entry.speechId)}&stage=${encodeURIComponent(entry.id)}`},attached);
  const card=page.locator(`[data-stage-direction="${attached.id}"]`);
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/stage-highlight/);
  await expect(card.locator('.stage-original')).toContainText(attached.text.slice(0,32));
  await expect(card.locator('.stage-ja')).toContainText(attached.summaryJa.slice(0,24));
  expect(await page.evaluate(id=>{
    const stage=document.querySelector(`[data-stage-direction="${CSS.escape(id)}"]`),translation=document.querySelector('[data-translation-card]');
    return !!stage&&!!translation&&!!(stage.compareDocumentPosition(translation)&Node.DOCUMENT_POSITION_FOLLOWING);
  },attached.id)).toBe(true);
  await card.locator('summary').click();
  await expect(card.getByText(attached.vocabulary[0].meaning,{exact:true})).toBeVisible();
  await expect(card.getByText(attached.notes[0],{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>({speechCount:MTS_INDEX_ZERO.store.speechById.size,stageCount:MTS_STAGE.diagnostics().total}))).toEqual({speechCount:1164,stageCount:777});
});

test('scene-setting context and mixed previous/next navigation use canonical stream order',async({page,request})=>{
  const data=await stageJson(request),setting=data.entries.find(entry=>entry.kind==='scene-setting');
  expect(setting).toBeTruthy();
  await ready(page);
  await page.evaluate(entry=>{MTS_INDEX_ZERO.state.setScene(entry.sceneId);location.hash=`#/script?stage=${encodeURIComponent(entry.id)}`},setting);
  const stagePage=page.locator(`[data-stage-page="${setting.id}"]`);
  await expect(stagePage).toBeVisible();
  await expect(stagePage.locator('.stage-situation-text')).toContainText(setting.text.slice(0,32));
  const nextHash=await page.evaluate(id=>{
    const sequence=MTS_STAGE.getReaderSequence(MTS_STAGE.getStage(id).sceneId),index=sequence.findIndex(item=>item.kind==='stage'&&item.id===id),item=sequence[index+1];
    if(!item)return'';
    if(item.kind==='speech')return`#/line?scene=${encodeURIComponent(item.sceneId)}&line=${encodeURIComponent(item.id)}`;
    const entry=item.stage;
    return entry.kind==='scene-setting'?`#/script?stage=${encodeURIComponent(entry.id)}`:`#/line?scene=${encodeURIComponent(entry.sceneId)}&line=${encodeURIComponent(entry.speechId)}&stage=${encodeURIComponent(entry.id)}`;
  },setting.id);
  if(nextHash){await stagePage.locator('[data-stage-next]').click();await page.waitForFunction(hash=>location.hash===hash,nextHash)}
});

test('Cue Practice and Rehearsal display stage directions with a persisted opt-out',async({page})=>{
  await ready(page);
  const target=await page.evaluate(()=>{
    for(const scene of ['act1-scene1','act1-scene2','act2']){
      const rows=MTS_INDEX_ZERO.store.getScene(scene);
      for(let index=1;index<rows.length;index+=1)if(MTS_INDEX_ZERO.store.getStageDirectionsForSpeech(rows[index].id).length)return{scene,line:rows[index].id,role:rows[index].speaker};
    }
    return null;
  });
  expect(target).toBeTruthy();
  await page.evaluate(target=>{MTS_INDEX_ZERO.state.setRole(target.role);MTS_INDEX_ZERO.state.setStageDirectionsVisible(true);location.hash=`#/cue?scene=${encodeURIComponent(target.scene)}&line=${encodeURIComponent(target.line)}`},target);
  const toggle=page.locator('[data-stage-visibility]');
  await expect(toggle).toBeChecked();
  await expect(page.locator('[data-practice-stage]').first()).toBeVisible();
  await toggle.uncheck();
  await expect(page.locator('[data-practice-stage]')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('mts.stageDirections.visible'))).toBe('false');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MTS_STAGE?.diagnostics?.().loaded===true,null,{timeout:15000});
  await expect(page.locator('[data-stage-visibility]')).not.toBeChecked();
  await expect(page.locator('[data-practice-stage]')).toHaveCount(0);
  await page.locator('[data-stage-visibility]').check();
  await expect(page.locator('[data-practice-stage]').first()).toBeVisible();
  await page.evaluate(target=>{location.hash=`#/rehearsal?scene=${encodeURIComponent(target.scene)}&line=${encodeURIComponent(target.line)}`},target);
  await expect(page.locator('[data-stage-visibility]')).toBeChecked();
  await expect(page.locator('[data-practice-stage]').first()).toBeVisible();
  expect(await page.evaluate(()=>['act1-scene1','act1-scene2','act2'].reduce((total,scene)=>total+MTS_INDEX_ZERO.store.getScene(scene).length,0))).toBe(1164);
});

test('stage directions remain available after a complete offline reload',async({page,context,request})=>{
  const data=await stageJson(request),attached=data.entries.find(entry=>entry.kind==='stage-direction');
  await ready(page);
  await page.evaluate(async()=>{await window.MTS_PWA_READY;await window.MTS_STAGE.ready});
  await page.waitForFunction(async()=>!!(await caches.match(new URL('./src/mousetrap_stage_directions.json',location.href).href)),null,{timeout:30000});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:10000});
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MTS_STAGE?.diagnostics?.().loaded===true,null,{timeout:15000});
  await page.evaluate(entry=>{location.hash=`#/line?scene=${encodeURIComponent(entry.sceneId)}&line=${encodeURIComponent(entry.speechId)}`},attached);
  await expect(page.locator(`[data-stage-direction="${attached.id}"]`)).toBeVisible();
  await expect(page.locator('[data-translation-card]')).toBeVisible();
});
