const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';
const CAST=['MOLLIE','TROTTER','GILES','MISS CASEWELL','CHRISTOPHER','MRS. BOYLE','PARAVICINI','MAJOR METCALF'];

async function child(page,name){
  await expect.poll(()=>page.frames().some(f=>f.url().includes(name))).toBe(true);
  return page.frames().find(f=>f.url().includes(name));
}

test.beforeEach(async({page})=>{
  await page.goto(BASE);
  await expect(page.locator('#dataGate')).toBeHidden();
});

test('production-path HTTP resources and canonical gate',async({page})=>{
  const qa=await page.evaluate(()=>window.MTS_P5_QA);
  expect(qa).toEqual({status:'PASS',speeches:1164,scenes:[190,336,638],vocabulary:1186,grammar:692,dictionary:578});
});

test('Home -> Script -> Line Detail -> Word Detail -> Line Detail',async({page})=>{
  await page.getByRole('button',{name:/Act I · Scene I を開く/}).click();
  await expect(page).toHaveURL(/#\/script/);
  await page.locator('[data-line]').first().click();
  await expect(page).toHaveURL(/#\/line\?/);
  await expect(page.locator('#learningOverlay')).toBeVisible();
  const frame=page.frameLocator('#learningFrame');
  const word=frame.locator('[data-lemma]').first();
  await expect(word).toBeVisible();
  await word.click();
  await expect(frame.getByRole('button',{name:'← Line Detail'})).toBeVisible();
  await frame.getByRole('button',{name:'← Line Detail'}).click();
  await expect(frame.getByRole('button',{name:'Cue Practice'})).toBeVisible();
});

test('004 -> 008 lands on the exact selected speech and consumes pending handoff',async({page})=>{
  await page.goto(BASE+'#/script');
  await expect(page.locator('#dataGate')).toBeHidden();
  const expected=await page.evaluate(()=>{
    const a=window.MTS_SHARED_SCRIPT_DATA['act1-scene1'].speeches;
    return {target:a[5],cue:a[4]};
  });
  await page.locator('[data-line]').nth(5).click();
  await page.frameLocator('#learningFrame').getByRole('button',{name:'Cue Practice'}).click();
  await expect(page).toHaveURL(/#\/cue\?/);
  const frame=await child(page,'008_cue_practice_P3.html');
  await frame.waitForSelector('#practiceView:not([hidden])');
  const landed=await frame.evaluate(()=>MTS008.getState());
  expect(landed.current).toBe(expected.target.id);
  await expect(frame.locator('#cueText')).toHaveText(expected.cue.text);
  expect(await page.evaluate(()=>localStorage.getItem('mts.characterId'))).toBe(expected.target.speaker);
  expect(await page.evaluate(()=>localStorage.getItem('mts.practice.pending'))).toBeNull();
});

test('cue inventory is 1164 speeches / 1161 cues',async({page})=>{
  const cues=await page.evaluate(cast=>{
    const C=new Set(cast);let n=0;
    for(const s of Object.values(window.MTS_SHARED_SCRIPT_DATA)){
      for(let i=1;i<s.speeches.length;i++) if(C.has(s.speeches[i].speaker)) n++;
    }
    return n;
  },CAST);
  expect(cues).toBe(1161);
});

test('Practice -> Cue Practice and Practice -> Rehearsal',async({page})=>{
  await page.goto(BASE+'#/practice');
  await page.evaluate(()=>{localStorage.setItem('mts.characterId','MOLLIE');localStorage.setItem('mts.selectedSceneId','act1-scene1')});
  await page.reload();
  await expect(page.locator('#dataGate')).toBeHidden();
  await page.getByRole('button',{name:'Cue Practice'}).first().click();
  await expect(page).toHaveURL(/#\/cue/);
  await page.goto(BASE+'#/practice');
  await page.getByRole('button',{name:'Rehearsal'}).first().click();
  await expect(page).toHaveURL(/#\/rehearsal/);
});

test('Rehearsal interaction persists progress',async({page})=>{
  const key='act1-scene1|TROTTER';
  await page.goto(BASE+'#/practice');
  await page.evaluate(()=>{localStorage.setItem('mts.characterId','TROTTER');localStorage.setItem('mts.selectedSceneId','act1-scene1');localStorage.removeItem('mts.sceneProgress');localStorage.removeItem('mts.practice.rehearsal.state')});
  await page.reload();
  await page.getByRole('button',{name:'Rehearsal'}).first().click();
  const frame=await child(page,'009_rehearsal_P4.html');
  await frame.waitForFunction(()=>MTS009&&MTS009.getState().total===190);
  for(let i=0;i<40;i++){
    const state=await frame.evaluate(()=>MTS009.getState());
    if(state.index>=12) break;
    await frame.evaluate(()=>MTS009.next());
  }
  const runtime=await frame.evaluate(()=>MTS009.getState());
  const persisted=await page.evaluate(k=>JSON.parse(localStorage.getItem('mts.practice.rehearsal.state')||'{}')[k],key);
  const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('mts.sceneProgress')||'{}')['act1-scene1']);
  expect(runtime.index).toBeGreaterThanOrEqual(12);
  expect(persisted.index).toBe(runtime.index);
  expect(persisted.speechId).toBe(runtime.current);
  expect(progress).toBeGreaterThan(0);
});

test('progress weighting',async({page})=>{
  await page.evaluate(()=>localStorage.setItem('mts.sceneProgress',JSON.stringify({'act1-scene1':100,'act1-scene2':50,'act2':25})));
  await page.goto(BASE+'#/progress');
  await expect(page.locator('#dataGate')).toBeHidden();
  await expect(page.locator('[data-act1]')).toHaveText('68%');
  await expect(page.locator('[data-overall]')).toHaveText('44%');
});

test('browser Back / Forward',async({page})=>{
  await page.goto(BASE+'#/script');
  await page.locator('[data-line]').nth(2).click();
  await expect(page).toHaveURL(/#\/line\?/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/script/);
  await page.goForward();
  await expect(page).toHaveURL(/#\/line\?/);
});

test('reload restore + stale state sanitization',async({page})=>{
  await page.evaluate(()=>{localStorage.setItem('mts.selectedSceneId','act1-scene2');localStorage.setItem('mts.characterId','MOLLIE')});
  await page.reload();
  expect(await page.evaluate(()=>localStorage.getItem('mts.selectedSceneId'))).toBe('act1-scene2');
  expect(await page.evaluate(()=>localStorage.getItem('mts.characterId'))).toBe('MOLLIE');
  await page.evaluate(()=>{localStorage.setItem('mts.selectedSceneId','BAD');localStorage.setItem('mts.characterId','BAD');localStorage.setItem('mts.lineDetail.current','{"sceneId":"bad","lineId":"bad"}')});
  await page.reload();
  await expect(page.locator('#dataGate')).toBeHidden();
  expect(await page.evaluate(()=>localStorage.getItem('mts.selectedSceneId'))).toBe('act1-scene1');
  expect(await page.evaluate(()=>localStorage.getItem('mts.characterId'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('mts.lineDetail.current'))).toBeNull();
});

async function expectFailClosed(browser,pattern,handler){
  const context=await browser.newContext();const p=await context.newPage();
  await p.route(pattern,handler);
  await p.goto(BASE);
  await expect(p.locator('#dataGate')).toBeVisible();
  await expect(p.locator('#gateStatus')).toContainText('FAIL-CLOSED');
  await context.close();
}

test('fail closed malformed canonical',async({browser})=>{
  await expectFailClosed(browser,'**/mousetrap_script_data.json',async route=>{const r=await route.fetch();const d=await r.json();d.act2.speeches.pop();await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(d)})});
});

test('fail closed missing / invalid JSON / invalid speech reference',async({browser})=>{
  await expectFailClosed(browser,'**/mousetrap_line_grammar.json',route=>route.fulfill({status:404,body:'missing'}));
  await expectFailClosed(browser,'**/mousetrap_line_translations.json',route=>route.fulfill({status:200,contentType:'application/json',body:'{bad json'}));
  await expectFailClosed(browser,'**/mousetrap_line_vocabulary.json',async route=>{const r=await route.fetch();const d=await r.json();d['bad-speech-id']=d[Object.keys(d)[0]];delete d[Object.keys(d)[0]];await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(d)})});
});

test('browser APIs: real TTS + SpeechRecognition capability/fallback',async({page})=>{
  const result=await page.evaluate(()=>{
    let tts=false;try{const u=new SpeechSynthesisUtterance('test');speechSynthesis.cancel();speechSynthesis.speak(u);speechSynthesis.cancel();tts=true}catch{}
    const C=window.SpeechRecognition||window.webkitSpeechRecognition;let rec={supported:!!C,constructed:false};
    if(C){try{const r=new C();r.lang='en-GB';r.continuous=false;r.abort();rec.constructed=true}catch(e){rec.error=String(e)}}
    return {tts,rec};
  });
  expect(result.tts).toBe(true);
  if(result.rec.supported) expect(result.rec.constructed).toBe(true);
});
