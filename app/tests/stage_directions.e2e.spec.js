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

test('Script Full renders the exact ordered stream as compact Japanese-first stage notes',async({page,request})=>{
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
  const entry=data.entries.find(item=>item.sceneId===scene&&item.kind==='stage-direction');
  const row=page.locator(`[data-stage-reader="${entry.id}"]`);
  await expect(row.locator('.stage-note-ja')).toHaveText(entry.summaryJa);
  await expect(row.locator('.stage-note-en')).toBeHidden();
  await expect(row).not.toContainText('Stage direction');
  await expect(row).not.toContainText('Open context');
  const compact=await row.evaluate(node=>({font:parseFloat(getComputedStyle(node.querySelector('.stage-note-ja')).fontSize),height:node.getBoundingClientRect().height,border:getComputedStyle(node).borderTopWidth}));
  expect(compact.font).toBeLessThanOrEqual(10);
  expect(compact.height).toBeLessThanOrEqual(42);
  expect(compact.border).toBe('0px');
  await row.locator('[data-stage-reveal]').click();
  await expect(row.locator('[data-stage-reveal]')).toHaveAttribute('aria-expanded','true');
  await expect(row.locator('.stage-note-en')).toBeVisible();
  await expect(row.locator('.stage-note-en')).toContainText(entry.text.slice(0,24));
});

test('Line Detail keeps actor cues by the speech and folds the remainder below Structure',async({page,request})=>{
  const data=await stageJson(request),bySpeech=new Map();
  for(const entry of data.entries.filter(entry=>entry.kind==='stage-direction')){
    if(!bySpeech.has(entry.speechId))bySpeech.set(entry.speechId,[]);
    bySpeech.get(entry.speechId).push(entry);
  }
  const pair=[...bySpeech].find(([,entries])=>entries.some(entry=>entry.actorCueForSpeech)&&entries.some(entry=>!entry.actorCueForSpeech));
  expect(pair).toBeTruthy();
  const [speechId,entries]=pair,actor=entries.find(entry=>entry.actorCueForSpeech),remainder=entries.find(entry=>!entry.actorCueForSpeech);
  await ready(page);
  await page.evaluate(({sceneId,speechId})=>{location.hash=`#/line?scene=${encodeURIComponent(sceneId)}&line=${encodeURIComponent(speechId)}`},{sceneId:actor.sceneId,speechId});
  const actorCard=page.locator(`[data-stage-direction="${actor.id}"]`),details=page.locator('[data-stage-context-details]'),remainderCard=page.locator(`[data-stage-direction="${remainder.id}"]`);
  await expect(actorCard).toBeVisible();
  await expect(actorCard.locator('.stage-note-ja')).toHaveText(actor.summaryJa);
  await expect(actorCard.locator('.stage-note-en')).toBeHidden();
  expect(await page.evaluate(()=>{
    const surface=document.querySelector('.line-page-surface')||document.querySelector('.line-page');
    const speech=surface.querySelector(':scope > .card'),actorNotes=surface.querySelector('[data-stage-actor-cues]'),translation=surface.querySelector('[data-translation-card]'),structure=surface.querySelector('[data-structure-card]'),context=surface.querySelector('[data-stage-context-details]');
    return !!speech&&!!actorNotes&&!!translation&&!!structure&&!!context&&!!(speech.compareDocumentPosition(actorNotes)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(actorNotes.compareDocumentPosition(translation)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(structure.compareDocumentPosition(context)&Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await actorCard.locator('[data-stage-reveal]').click();
  await expect(actorCard.locator('.stage-note-en')).toBeVisible();
  await expect(details).not.toHaveAttribute('open','');
  await expect(remainderCard).toBeHidden();
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open','');
  await expect(remainderCard.locator('.stage-note-ja')).toHaveText(remainder.summaryJa);
  await expect(remainderCard.locator('.stage-note-en')).toBeHidden();
  await remainderCard.locator('[data-stage-reveal]').click();
  await expect(remainderCard.locator('.stage-note-en')).toBeVisible();
  await page.evaluate(({sceneId,speechId,stageId})=>{location.hash=`#/line?scene=${encodeURIComponent(sceneId)}&line=${encodeURIComponent(speechId)}&stage=${encodeURIComponent(stageId)}`},{sceneId:remainder.sceneId,speechId,stageId:remainder.id});
  await expect(remainderCard).toHaveClass(/stage-highlight/);
  await expect(details).toHaveAttribute('open','');
  await expect(remainderCard.locator('.stage-note-en')).toBeVisible();
  await expect(page.locator('[data-stage-direction-group]')).toHaveCount(0);
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
  const data=await stageJson(request),attached=data.entries.find(entry=>entry.kind==='stage-direction'&&entry.actorCueForSpeech===true);
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
