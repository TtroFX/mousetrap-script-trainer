import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
const replaceOnce=(s,from,to,label=from)=>{if(!s.includes(from))throw new Error(`missing transform: ${label}`);return s.replace(from,to)};
const replaceAll=(s,from,to)=>s.split(from).join(to);

// index.html
{
  let s=read('index.html');
  s=replaceAll(s,'<html lang="ja">','<html lang="en">');
  s=replaceAll(s,'<h1>台本を覚える</h1>','<h1>Learn Your Lines</h1>');
  s=replaceAll(s,'アプリを起動しています…','Starting the app…');
  s=replaceAll(s,'aria-label="辞書を閉じる"','aria-label="Close dictionary"');
  write('index.html',s);
}

// offline.html
{
  let s=read('offline.html');
  s=replaceAll(s,'lang="ja"','lang="en"');
  s=replaceAll(s,'必要なアプリデータを読み込めませんでした。以前の正常なキャッシュがある場合はアプリを開き直してください。','Required app data could not be loaded. If a valid cache is available, reopen the app.');
  s=replaceAll(s,'データ不整合時は安全のため学習画面を起動しません。','The study screen will not start when cached data is inconsistent.');
  write('offline.html',s);
}

// manifest language
{
  const m=JSON.parse(read('manifest.webmanifest'));m.lang='en';write('manifest.webmanifest',JSON.stringify(m,null,2)+'\n');
}

// Resume / Bookmark UI
{
  let s=read('src/resume-bookmarks.js');
  const map=new Map([
    ['${this.esc(this.resumeTitle(latest))} の続き','Continue ${this.esc(this.resumeTitle(latest))}'],
    ['>続きから</button>','>Continue</button>'],
    ['>Practiceを再開 · ${this.esc(this.resumeTitle(practice))}</button>','>Resume Practice · ${this.esc(this.resumeTitle(practice))}</button>'],
    ['覚えにくい台詞や後で見返したい台詞をまとめます。','Save lines you want to revisit or memorize.'],
    ['>Bookmark一覧</button>','>View Bookmarks</button>'],
    ['Bookmarkを削除','Remove bookmark'],
    ['Bookmarkに追加','Add bookmark'],
    ['Bookmarkに追加しました','Bookmark added'],
    ['Bookmarkを削除しました','Bookmark removed'],
    ['<h2>Bookmark一覧</h2>','<h2>Bookmarks</h2>'],
    ['台本データを読み込んでいます…','Loading script data…'],
    ['台詞をタップするとLine Detailを開きます。★はワンクリックで解除できます。','Tap a line to open Line Detail. Tap ★ to remove it instantly.'],
    ['Bookmark削除','Remove bookmark'],
    ['Bookmarkはまだありません','No bookmarks yet'],
    ['ScriptまたはLine Detailの☆を押すとここに追加されます。','Tap ☆ in Script or Line Detail to save a line here.'],
    ['>Scriptを開く</button>','>Open Script</button>'],
    ['元に戻す','Undo'],
  ]);
  for(const [from,to] of [...map].sort((a,b)=>b[0].length-a[0].length))s=replaceAll(s,from,to);
  write('src/resume-bookmarks.js',s);
}

// Main runtime English UI + gestures + study section ordering.
{
  let s=read('src/main.js');
  if(!s.includes("import './gesture-controls.js';"))s=replaceOnce(s,"import { ResumeBookmarksUI } from './resume-bookmarks.js';","import { ResumeBookmarksUI } from './resume-bookmarks.js';\nimport './gesture-controls.js';",'gesture import');

  const replacements=[
    ['台本データを読み込めませんでした。Home・Role・保存済みProgressは利用できます。','Script data could not be loaded. Home, Role, and saved Progress remain available.'],
    ['Reader・Cue Practice・Rehearsal・Progressを同じScene / Role状態で接続します。','Reader, Cue Practice, Rehearsal, and Progress share the same Scene / Role state.'],
    ['Cue / Rehearsalを始める前にRoleを選択してください。','Choose a role before starting Cue Practice or Rehearsal.'],
    ['RoleはReader / Cue Practice / Rehearsal / Progressで共通利用します。役変更で既存progressは削除しません。','The selected role is shared by Reader, Cue Practice, Rehearsal, and Progress. Changing roles does not delete existing progress.'],
    ['指定した台詞はこのCue Practice対象ではありません。','This line is not part of the current Cue Practice set.'],
    ['この台詞には開始できる直前Cueがありません。','No preceding cue is available for this line.'],
    ['このRoleには開始できるCueがありません。','No usable cue is available for this role.'],
    ['Sceneを通して練習します。自分の台詞はYOUR TURNになります。','Practice the whole scene. Your lines appear as YOUR TURN.'],
    ['結果をタップするとLine Detailを開きます。','Tap a result to open Line Detail.'],
    ['台本データを準備中… Homeはそのまま操作できます。','Preparing script data… Home remains available.'],
    ['訳・語彙・文法を読み込めませんでした。','Translation, vocabulary, and grammar could not be loaded.'],
    ['訳・語彙・文法を読み込んでいます…','Loading translation, vocabulary, and grammar…'],
    ['このRoleにはこのSceneの台詞がありません。','This role has no lines in this scene.'],
    ['台詞・speaker・英単語・日本語訳','Line, speaker, vocabulary, or translation'],
    ['訳・Vocabulary検索を準備中…','Preparing translation and vocabulary search…'],
    ['Cue Practice対象がありません。','No Cue Practice items are available.'],
    ['Rehearsal対象がありません。','No Rehearsal items are available.'],
    ['辞書データを読み込めませんでした。','Dictionary data could not be loaded.'],
    ['Structureを読み込めませんでした。','Structure could not be loaded.'],
    ['Structureを読み込んでいます…','Loading Structure…'],
    ['Structureは利用できません。','Structure is unavailable.'],
    ['登録Vocabularyはありません。','No vocabulary entries.'],
    ['Vocabularyを読み込めませんでした。','Vocabulary could not be loaded.'],
    ['Vocabularyを読み込んでいます…','Loading Vocabulary…'],
    ['追加Grammar noteはありません。','No additional grammar notes.'],
    ['Grammarを読み込めませんでした。','Grammar could not be loaded.'],
    ['Grammarを読み込んでいます…','Loading Grammar…'],
    ['日本語訳はありません。','No translation available.'],
    ['辞書情報が見つかりません。','Dictionary information not found.'],
    ['Sceneと自分の役を選択します。','Choose a scene and your role.'],
    ['現在位置は保存されています。','Your current position has been saved.'],
    ['先にRoleを選択してください','Choose a role first'],
    ['Roleを選択してください。','Choose a role.'],
    ['台本データを読み込めませんでした。','Script data could not be loaded.'],
    ['台本を読み込んでいます…','Loading script…'],
    ['辞書を読み込んでいます…','Loading dictionary…'],
    ['検索語を入力してください。','Enter a search term.'],
    ['Sceneを選択','Choose a Scene'],
    ['学習進捗','Learning Progress'],
    ['役を選択','Choose Your Role'],
    ['台本検索','Script Search'],
    ['台本を覚える','Learn Your Lines'],
    ['前回の台詞へ','Back to Last Line'],
    ['未選択','Not selected'],
    ['直前Cueから自分の台詞を思い出す','Recall your line from the preceding cue'],
    ['通し稽古・TTS・音声認識','Full run-through · TTS · Speech recognition'],
    ['訳・語彙を再試行','Retry study data'],
    ['Structureを再試行','Retry Structure'],
    ['Line Detailへ','Open Line Detail'],
    ['思い出せなかった','Couldn’t recall'],
    ['かなり迷った','Needed effort'],
    ['思い出せた','Recalled'],
    ['日本語訳','Translation'],
    ['日本語','Meaning'],
    ['主語','Subject'],['動詞','Verb'],['目的語','Object'],['補語','Complement'],['修飾','Modifier'],
    ['再試行','Retry'],
  ];
  for(const [from,to] of [...replacements].sort((a,b)=>b[0].length-a[0].length))s=replaceAll(s,from,to);
  s=replaceAll(s,'data-home-script>${esc(sceneMeta(selected).label)} を開く</button>','data-home-script>Open ${esc(sceneMeta(selected).label)}</button>');
  s=replaceAll(s,'「${esc(term)}」の結果はありません。','No results for “${esc(term)}”.');
  s=replaceAll(s,'<summary>詳しく見る</summary>','<summary>Grammar & Vocabulary</summary>');

  const helper=`function arrangeLineStudySections(){const page=app.querySelector('.line-page');if(!page)return;const cards=[...page.querySelectorAll(':scope > .card')],grammar=cards.find(c=>c.querySelector('h3')?.textContent==='Grammar / Usage'),structure=cards.find(c=>c.querySelector('.section-head h3')?.textContent==='Structure');if(grammar){const details=grammar.querySelector('details');if(details){const fragment=document.createDocumentFragment();for(const node of [...details.childNodes])if(node.nodeName!=='SUMMARY')fragment.append(node);details.replaceWith(fragment)}}if(structure&&!structure.querySelector('.structure-details')){structure.querySelector('.section-head')?.remove();const details=document.createElement('details');details.className='structure-details';const summary=document.createElement('summary');summary.className='structure-summary';summary.innerHTML='<span>Structure</span><small>S / V / O / C / M</small>';while(structure.firstChild)details.append(structure.firstChild);details.prepend(summary);structure.append(details)}if(grammar&&structure)structure.before(grammar)}\n`;
  if(!s.includes('function arrangeLineStudySections()'))s=replaceOnce(s,'function openLine(scene,line)',helper+'function openLine(scene,line)','study arrangement helper');
  const marker='}async function openWordSheet';
  if(!s.includes('arrangeLineStudySections();}async function openWordSheet')){
    const i=s.indexOf(marker);if(i<0)throw new Error('missing lineView end marker');s=s.slice(0,i)+'arrangeLineStudySections();'+s.slice(i);
  }
  s=replaceAll(s,'overlay.hidden=false;content.querySelector','window.MTS_GESTURES?.resetSheet?.();overlay.hidden=false;content.querySelector');
  s=replaceAll(s,"function closeWordSheet(){document.getElementById('word-overlay').hidden=true}","function closeWordSheet(){window.MTS_GESTURES?.resetSheet?.();document.getElementById('word-overlay').hidden=true}");
  write('src/main.js',s);
}

// CSS: suppress browser overscroll refresh and animate sheet dismissal.
{
  let s=read('src/app.css');
  const block=`\n/* gesture-controls-r4 */\nhtml,body,#app{overscroll-behavior-y:none}\n.sheet-backdrop{overscroll-behavior:contain;transition:background-color .18s ease}\n.word-sheet{overscroll-behavior:contain;touch-action:pan-y;will-change:transform;transition:transform .18s cubic-bezier(.2,.8,.2,1)}\n.word-sheet.is-dragging{transition:none}\n.word-sheet.is-dismissing{transform:translateY(100%)!important}\n.sheet-backdrop.is-dismissing{background:rgba(20,17,14,0)}\n.structure-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;font-weight:900;color:var(--accent);cursor:pointer;list-style:none}\n.structure-summary::-webkit-details-marker{display:none}\n.structure-summary::after{content:'⌄';font-size:18px;transition:transform .18s ease}\n.structure-details[open]>.structure-summary::after{transform:rotate(180deg)}\n.structure-summary small{color:var(--muted);font-size:11px;font-weight:700;margin-left:auto}\n.structure-details[open]>.structure-summary{margin-bottom:10px}\n@media(prefers-reduced-motion:reduce){.word-sheet,.sheet-backdrop,.structure-summary::after{transition:none!important}}\n`;
  if(!s.includes('/* gesture-controls-r4 */'))s+=block;
  write('src/app.css',s);
}

// PWA build/version + offline shell.
{
  let s=read('src/config.js');s=s.replace(/index-zero-2026-08-26-r\d+/g,'index-zero-2026-08-26-r4');write('src/config.js',s);
  const p=JSON.parse(read('pwa-version.json'));p.buildId='index-zero-2026-08-26-r4';write('pwa-version.json',JSON.stringify(p,null,2)+'\n');
  let sw=read('sw.js');sw=sw.replace(/index-zero-2026-08-26-r\d+/g,'index-zero-2026-08-26-r4');if(!sw.includes("'./src/gesture-controls.js'"))sw=replaceOnce(sw,"'./src/state-store.js','./src/resume-bookmarks.js','./src/main.js'","'./src/state-store.js','./src/resume-bookmarks.js','./src/gesture-controls.js','./src/main.js'",'SW gesture shell');write('sw.js',sw);
  let a=read('scripts/assemble-production.mjs');if(!a.includes("'src/gesture-controls.js'"))a=replaceOnce(a,"'src/state-store.js','src/resume-bookmarks.js','src/main.js'","'src/state-store.js','src/resume-bookmarks.js','src/gesture-controls.js','src/main.js'",'assembler gesture module');write('scripts/assemble-production.mjs',a);
}

// Static architecture QA.
{
  let s=read('tests/index_zero_static.mjs');
  if(!s.includes("'src/gesture-controls.js'"))s=replaceOnce(s,"'src/state-store.js','src/resume-bookmarks.js','src/main.js'","'src/state-store.js','src/resume-bookmarks.js','src/gesture-controls.js','src/main.js'",'static gesture required');
  s += `\nconst uiFiles=['index.html','offline.html','src/main.js','src/resume-bookmarks.js'];for(const f of uiFiles){if(/[ぁ-んァ-ヶ一-龠]/.test(read(f)))fail('non-English hard-coded UI remains in '+f)}\nconst gestures=read('src/gesture-controls.js'),css=read('src/app.css');if(!main.includes("import './gesture-controls.js'"))fail('gesture module not imported');if(!css.includes('overscroll-behavior-y:none'))fail('pull-to-refresh CSS guard missing');if(!gestures.includes("event.preventDefault()")||!gestures.includes('Quick flick down'))fail('gesture guards missing');if(main.includes('new MutationObserver')||gestures.includes('MutationObserver'))fail('runtime MutationObserver forbidden');if(!main.includes('arrangeLineStudySections')||!main.includes('structure-details'))fail('Line Detail study ordering/collapse missing');\n`;
  write('tests/index_zero_static.mjs',s);
}

// Existing E2E expectations now use English UI.
{
  let s=read('tests/index_zero.e2e.spec.js');
  const map=[['台本を覚える','Learn Your Lines'],['Act I · Scene I を開く','Open Act I · Scene I'],['詳しく見る','Grammar & Vocabulary'],['役を選択','Choose Your Role'],['台本データを読み込めませんでした。','Script data could not be loaded.']];
  for(const [a,b] of map)s=replaceAll(s,a,b);
  // Grammar/Vocabulary is now always expanded, so no summary click is needed.
  s=s.replace(/\s*await page\.getByText\('Grammar & Vocabulary',\{exact:true\}\)\.click\(\);/g,'');
  write('tests/index_zero.e2e.spec.js',s);
}
{
  let s=read('tests/resume_bookmarks.e2e.spec.js');s=replaceAll(s,"name:'続きから'","name:'Continue'");s=replaceAll(s,"name:'元に戻す'","name:'Undo'");write('tests/resume_bookmarks.e2e.spec.js',s);
}

// New regression coverage.
write('tests/gesture_english.e2e.spec.js',`const {test,expect}=require('@playwright/test');\nconst BASE='http://127.0.0.1:4173/index.html';\nasync function ready(page){await page.goto(BASE,{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'Learn Your Lines'})).toBeVisible();await page.waitForFunction(()=>MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000})}\ntest('UI chrome is English and pull-to-refresh overscroll is disabled',async({page})=>{await ready(page);await expect(page.getByRole('button',{name:/Open Act I · Scene I/})).toBeVisible();await page.goto(BASE+'#/more');await expect(page.getByRole('heading',{name:'Choose Your Role'})).toBeVisible();const x=await page.evaluate(()=>({html:getComputedStyle(document.documentElement).overscrollBehaviorY,body:getComputedStyle(document.body).overscrollBehaviorY,lang:document.documentElement.lang}));expect(x).toEqual({html:'none',body:'none',lang:'en'})});\ntest('Grammar and Vocabulary precede collapsed Structure',async({page})=>{await ready(page);const target=await page.evaluate(()=>MTS_INDEX_ZERO.store.getScene('act1-scene1')[5].id);await page.goto(BASE+'#/line?scene=act1-scene1&line='+target);await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy()&&MTS_INDEX_ZERO.store.hasStructure(),null,{timeout:15000});await expect(page.getByText('Grammar / Usage',{exact:true})).toBeVisible();const order=await page.evaluate(()=>[...document.querySelectorAll('.line-page>:scope>.card')].map((c,i)=>({i,t:c.textContent})));const gi=order.find(x=>x.t.includes('Grammar / Usage')).i,si=order.find(x=>x.t.includes('Structure')).i;expect(gi).toBeLessThan(si);const details=page.locator('.structure-details');await expect(details).not.toHaveAttribute('open','');await page.locator('.structure-summary').click();await expect(details).toHaveAttribute('open','')});\ntest('dictionary sheet closes with a fast downward flick from a scrolled position',async({page})=>{await ready(page);const target=await page.evaluate(async()=>{await MTS_INDEX_ZERO.store.loadStudy();for(const s of ['act1-scene1','act1-scene2','act2'])for(const x of MTS_INDEX_ZERO.store.getScene(s))if(MTS_INDEX_ZERO.store.getVocabulary(x.id).length)return{scene:s,line:x.id};return null});await page.goto(BASE+'#/line?scene='+target.scene+'&line='+target.line);await page.waitForFunction(()=>!!document.querySelector('[data-detail-word]'),null,{timeout:15000});await page.locator('[data-detail-word]').first().click();await expect(page.locator('#word-overlay')).toBeVisible();await page.evaluate(()=>{const s=document.querySelector('.word-sheet');s.scrollTop=120;s.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'pen',clientX:180,clientY:220}));s.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'pen',clientX:182,clientY:350}))});await expect(page.locator('#word-overlay')).toBeHidden({timeout:1000})});\n`);

{
  const p=JSON.parse(read('package.json'));p.scripts['test:e2e']='playwright test tests/index_zero.e2e.spec.js tests/resume_bookmarks.e2e.spec.js tests/gesture_english.e2e.spec.js --config=playwright.index-zero.config.js';write('package.json',JSON.stringify(p,null,2)+'\n');
}

// Final hard-coded UI English gate.
for(const file of ['index.html','offline.html','src/main.js','src/resume-bookmarks.js']){
  const s=read(file);const m=s.match(/[ぁ-んァ-ヶ一-龠]/);if(m)throw new Error(`Japanese hard-coded UI remains in ${file} near ${m.index}: ${s.slice(Math.max(0,m.index-50),m.index+80)}`);
}
console.log('r4 UI/gesture migration applied');
