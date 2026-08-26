from pathlib import Path
import re, json

main=Path('app/src/main.js')
s=main.read_text(encoding='utf-8')
old="class=\"line-row ${kind==='cue'?'cue-row':''} ${kind==='target'?'target-row':''}\""
new="class=\"line-row ${kind==='cue'?'cue-row':''} ${kind==='target'?'target-row':''} ${role&&speech.speaker===role?'selected-role-line':''}\""
if old not in s:
    raise SystemExit('reader row class marker missing')
s=s.replace(old,new,1)
old_close="app.querySelector('[data-close-line]').onclick=()=>go('#/script');"
new_close="app.querySelector('[data-close-line]').onclick=()=>go(`#/script?line=${encodeURIComponent(line)}`);"
if old_close not in s:
    raise SystemExit('line close marker missing')
s=s.replace(old_close,new_close,1)
arrange="""function arrangeLineStudySections(){
  const page=app.querySelector('.line-page');if(!page)return;
  const cards=[...page.querySelectorAll(':scope > .card')];
  let studyNotes=cards.find(c=>c.querySelector('summary')?.textContent?.includes('Grammar & Vocabulary')||c.querySelector('h3')?.textContent==='Grammar / Usage'||[...c.querySelectorAll('h3')].some(h=>h.textContent==='Words'));
  const structure=cards.find(c=>c.querySelector('.section-head h3')?.textContent==='Structure'||c.querySelector('.structure-details'));
  if(studyNotes){
    const details=studyNotes.querySelector('details');
    if(details){const fragment=document.createDocumentFragment();for(const node of [...details.childNodes])if(node.nodeName!=='SUMMARY')fragment.append(node);details.replaceWith(fragment)}
    const grammarHeading=[...studyNotes.querySelectorAll('h3')].find(h=>h.textContent==='Grammar / Usage');
    if(grammarHeading?.nextElementSibling?.textContent?.trim()==='No additional grammar notes.'){grammarHeading.nextElementSibling.remove();grammarHeading.remove()}
    const wordsHeading=[...studyNotes.querySelectorAll('h3')].find(h=>h.textContent==='Words');
    if(wordsHeading?.nextElementSibling?.textContent?.trim()==='No vocabulary entries.'){wordsHeading.nextElementSibling.remove();wordsHeading.remove()}
    if(!studyNotes.querySelector('h3,.grammar-item,.word-row,.micro-status,.error-text')){studyNotes.remove();studyNotes=null}
  }
  if(structure&&!structure.querySelector('.structure-details')){structure.querySelector('.section-head')?.remove();const details=document.createElement('details');details.className='structure-details';const summary=document.createElement('summary');summary.className='structure-summary';summary.innerHTML='<span>Structure</span><small>S / V / O / C / M</small>';while(structure.firstChild)details.append(structure.firstChild);details.prepend(summary);structure.append(details)}
  if(studyNotes&&structure&&studyNotes.isConnected)structure.before(studyNotes)
}"""
ns,n=re.subn(r"function arrangeLineStudySections\(\)\{.*?\}\nfunction openLine",arrange+"\nfunction openLine",s,count=1,flags=re.S)
if n!=1:
    raise SystemExit('arrangeLineStudySections replacement failed')
main.write_text(ns,encoding='utf-8')

rb=Path('app/src/resume-bookmarks.js')
r=rb.read_text(encoding='utf-8')
start=r.index('  decorateHome() {')
end=r.index('\n\n  bookmarkToggle(',start)
fn="""  decorateHome() {
    const shell = this.app.querySelector('.shell');
    const header = shell?.querySelector('.app-top');
    if (!shell || !header) return;
    shell.querySelector('[data-resume-home]')?.remove();
    shell.querySelector('[data-bookmarks-home]')?.remove();
    const latest = this.state.latestResume();
    const practice = this.state.latestPracticeResume();
    if (latest) {
      const section = document.createElement('section');
      section.className = 'card resume-card';
      section.dataset.resumeHome = '1';
      section.innerHTML = `<div class=\"eyebrow\">Continue</div><div class=\"resume-main\"><div><h2>Continue ${this.esc(this.resumeTitle(latest))}</h2><p>${this.esc(this.resumeMeta(latest))}</p></div><button class=\"primary-btn\" type=\"button\" data-resume-primary>Continue</button></div>${practice && practice.kind !== latest.kind ? `<button class=\"resume-practice-link\" type=\"button\" data-resume-practice>Resume Practice · ${this.esc(this.resumeTitle(practice))}</button>` : ''}`;
      header.insertAdjacentElement('afterend', section);
      section.querySelector('[data-resume-primary]').onclick = () => this.applyResume(latest);
      section.querySelector('[data-resume-practice]')?.addEventListener('click', () => this.applyResume(practice));
    }
    const rows = this.canonicalBookmarks('all');
    const count = rows.length;
    const bookmarkCard = document.createElement('section');
    bookmarkCard.className = 'card bookmark-home-card';
    bookmarkCard.dataset.bookmarksHome = '1';
    bookmarkCard.innerHTML = `<div class=\"bookmark-home-head\"><div><div class=\"eyebrow\">Bookmarks</div><h3>${count} ${count === 1 ? 'line' : 'lines'} saved</h3></div><button class=\"ghost-btn\" type=\"button\" data-open-bookmarks>View All</button></div><div class=\"home-bookmark-scroll\" data-home-bookmark-scroll>${rows.length ? rows.map(x => `<div class=\"bookmark-row home-bookmark-row\" data-home-bookmark-row=\"${this.esc(x.lineId)}\"><button type=\"button\" class=\"bookmark-open\" data-home-bookmark-open=\"${this.esc(x.lineId)}\" data-home-bookmark-scene=\"${this.esc(x.sceneId)}\"><span><b>${this.esc(x.speech.speaker)}</b> · ${this.esc(this.sceneMeta(x.sceneId).label)}</span><span>${this.esc(x.speech.text)}</span></button><button type=\"button\" class=\"bookmark-remove\" aria-label=\"Remove bookmark\" data-home-bookmark-remove=\"${this.esc(x.lineId)}\">★</button></div>`).join('') : '<div class=\"home-bookmark-empty\"><p class=\"muted\">No bookmarks yet. Tap ☆ beside a line to save it here.</p></div>'}</div>`;
    const sceneGrid = shell.querySelector('.scene-grid');
    (sceneGrid || shell.lastElementChild).insertAdjacentElement('afterend', bookmarkCard);
    bookmarkCard.querySelector('[data-open-bookmarks]').onclick = () => this.go('#/bookmarks');
    bookmarkCard.querySelectorAll('[data-home-bookmark-open]').forEach(button => button.onclick = () => {
      this.state.setScene(button.dataset.homeBookmarkScene);
      this.go(`#/line?scene=${encodeURIComponent(button.dataset.homeBookmarkScene)}&line=${encodeURIComponent(button.dataset.homeBookmarkOpen)}`);
    });
    bookmarkCard.querySelectorAll('[data-home-bookmark-remove]').forEach(button => button.onclick = () => {
      const removed = this.state.removeBookmark(button.dataset.homeBookmarkRemove);
      this.decorateHome();
      this.showToast('Bookmark removed', removed || null);
    });
  }"""
rb.write_text(r[:start]+fn+r[end:],encoding='utf-8')

css=Path('app/src/app.css')
c=css.read_text(encoding='utf-8')
if '/* interaction-polish-r5 */' not in c:
    c += """

/* interaction-polish-r5 */
.selected-role-line{border-color:#c39a68;background:linear-gradient(105deg,rgba(255,255,255,.22),rgba(255,255,255,0) 40%),repeating-linear-gradient(0deg,#ead2ae 0,#ead2ae 18px,#e4c495 19px,#ead2ae 38px);box-shadow:0 10px 24px rgba(91,58,29,.11)}
.selected-role-line .speaker{color:#6d4327}.selected-role-line .line-text{color:#2d241c}.selected-role-line.target-row{border-left-color:#74472b}
.bookmark-home-card{display:block}.bookmark-home-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.bookmark-home-head h3{margin:.25em 0}.home-bookmark-scroll{display:grid;gap:8px;max-height:330px;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding-right:3px;-webkit-overflow-scrolling:touch}.home-bookmark-row{min-height:76px}.home-bookmark-empty{padding:4px 2px}.home-bookmark-empty p{margin:.4em 0}.home-bookmark-scroll .bookmark-open{box-shadow:none;background:#fcfaf7}
@media(max-width:520px){.bookmark-home-head{align-items:stretch}.bookmark-home-head .ghost-btn{min-width:86px}}
"""
css.write_text(c,encoding='utf-8')

cfg=Path('app/src/config.js')
cfg.write_text(cfg.read_text(encoding='utf-8').replace('index-zero-2026-08-26-r4','index-zero-2026-08-26-r5'),encoding='utf-8')
sw=Path('app/sw.js')
sw.write_text(sw.read_text(encoding='utf-8').replace('index-zero-2026-08-26-r4','index-zero-2026-08-26-r5'),encoding='utf-8')
pv=Path('app/pwa-version.json')
obj=json.loads(pv.read_text(encoding='utf-8'));obj['buildId']='index-zero-2026-08-26-r5';pv.write_text(json.dumps(obj,indent=2)+'\n',encoding='utf-8')
rt=Path('app/tests/resume_bookmarks.e2e.spec.js')
rt.write_text(rt.read_text(encoding='utf-8').replace('index-zero-2026-08-26-r3','index-zero-2026-08-26-r5').replace('index-zero-2026-08-26-r4','index-zero-2026-08-26-r5'),encoding='utf-8')

pkg=Path('app/package.json')
obj=json.loads(pkg.read_text(encoding='utf-8'))
cmd=obj['scripts']['test:e2e']
if 'tests/r5_behavior.e2e.spec.js' not in cmd:
    obj['scripts']['test:e2e']=cmd.replace(' --config=', ' tests/r5_behavior.e2e.spec.js --config=')
pkg.write_text(json.dumps(obj,indent=2)+'\n',encoding='utf-8')

st=Path('app/tests/index_zero_static.mjs')
z=st.read_text(encoding='utf-8')
if 'r5 Home bookmark scroller missing' not in z:
    z += "\nfor(const term of [\"?line=${encodeURIComponent(line)}\",'selected-role-line'])if(!main.includes(term))fail('r5 Script return/role emphasis missing: '+term);const rb5=read('src/resume-bookmarks.js');if(!rb5.includes('home-bookmark-scroll')||!css.includes('max-height:330px'))fail('r5 Home bookmark scroller missing');if(!main.includes(\"No additional grammar notes.\")||!main.includes(\"No vocabulary entries.\"))fail('r5 empty study suppression contract missing');\n"
st.write_text(z,encoding='utf-8')
