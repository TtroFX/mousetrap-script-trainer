const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';
const REQUIRED=[
  './','./index.html','./src/app.css','./src/config.js','./src/data-store.js','./src/state-store.js','./src/resume-bookmarks.js','./src/gesture-controls.js','./src/main.js','./src/study/study.css','./src/study/structure-model.js','./src/study/structure-view.js','./src/study/dictionary-sheet.js','./manifest.webmanifest','./offline.html','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png',
  'mousetrap_script_data.json','mousetrap_line_translations.json','mousetrap_line_interpretation.json','mousetrap_line_vocabulary.json','mousetrap_line_grammar.json','mousetrap_word_dictionary.json','mousetrap_line_structure.json'
];

test('installed app remains fully usable with network disabled',async({page,context})=>{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();
  await page.evaluate(async()=>{if(!window.MTS_PWA_READY)throw new Error('MTS_PWA_READY missing');await window.MTS_PWA_READY;});
  await page.waitForFunction(async required=>{
    const checks=await Promise.all(required.map(async asset=>{
      const url=new URL(asset,location.href).href;
      return !!(await caches.match(url));
    }));
    return checks.every(Boolean);
  },REQUIRED,{timeout:30000});
  const missing=await page.evaluate(async required=>{
    const out=[];
    for(const asset of required){if(!(await caches.match(new URL(asset,location.href).href)))out.push(asset);}
    return out;
  },REQUIRED);
  expect(missing).toEqual([]);

  // Reload once online so the freshly installed worker definitely controls this tab.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:10000});
  await page.waitForFunction(()=>window.MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000});

  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();
  await page.waitForFunction(()=>window.MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000});
  await page.evaluate(()=>Promise.all([MTS_INDEX_ZERO.store.loadStudy(),MTS_INDEX_ZERO.store.loadStructure()]));
  await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy()&&MTS_INDEX_ZERO.store.hasStructure(),null,{timeout:15000});
  expect(await page.evaluate(()=>({
    core:MTS_INDEX_ZERO.store.hasCore(),
    study:MTS_INDEX_ZERO.store.hasStudy(),
    structure:MTS_INDEX_ZERO.store.hasStructure(),
    speeches:['act1-scene1','act1-scene2','act2'].reduce((n,s)=>n+MTS_INDEX_ZERO.store.getScene(s).length,0)
  }))).toEqual({core:true,study:true,structure:true,speeches:1164});

  const sample=await page.evaluate(()=>{
    for(const scene of ['act1-scene1','act1-scene2','act2'])for(const speech of MTS_INDEX_ZERO.store.getScene(scene)){
      const vocab=MTS_INDEX_ZERO.store.getVocabulary(speech.id);
      if(vocab.length&&MTS_INDEX_ZERO.store.getTranslation(speech.id)&&MTS_INDEX_ZERO.store.getStructure(speech.id))return{scene,line:speech.id};
    }
    return null;
  });
  expect(sample).toBeTruthy();
  await page.evaluate(({scene,line})=>{location.hash=`#/line?scene=${encodeURIComponent(scene)}&line=${encodeURIComponent(line)}`;},sample);
  await expect(page.locator('.line-page')).toBeVisible();
  await expect(page.getByText('Translation',{exact:true})).toBeVisible();
  await expect(page.getByText('Structure',{exact:true})).toBeVisible();
  await expect(page.locator('[data-word-line]').first()).toBeVisible();
  await page.locator('[data-word-line]').first().click();
  await expect(page.locator('#word-overlay')).toBeVisible();
  await expect(page.getByText('Word dictionary',{exact:true})).toBeVisible();
  await page.locator('#word-close').click();

  // Practice state and rehearsal routes must also remain available without network.
  await page.evaluate(()=>{location.hash='#/more';});
  await page.getByRole('button',{name:/^MOLLIE/}).click();
  await page.evaluate(()=>{location.hash='#/cue?scene=act1-scene1';});
  await expect(page.getByText(/YOUR LINE · MOLLIE/)).toBeVisible();
  await page.getByRole('button',{name:'Reveal'}).click();
  await expect(page.getByRole('button',{name:/Got it/})).toBeVisible();
  await page.evaluate(()=>{location.hash='#/rehearsal?scene=act1-scene1';});
  await expect(page.getByRole('button',{name:/Skip/})).toBeVisible();
});
