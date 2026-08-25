// Reader v2 interaction layer: inline vocabulary highlights + dictionary pull-up.
(()=>{'use strict';
const app=document.getElementById('app');
const wordOverlay=document.getElementById('wordOverlay');
const wordSheet=document.getElementById('wordSheet');
const wordHandle=document.getElementById('wordSheetHandle');
const wordClose=document.getElementById('wordSheetClose');
const wordContent=document.getElementById('wordSheetContent');
if(!app||!wordOverlay||!wordSheet||!wordHandle||!wordClose||!wordContent)return;

const KEY={selectedScene:'mts.selectedSceneId',lineCurrent:'mts.lineDetail.current'};
let restoreFocus=null,closeTimer=0,drag=null,enhanceQueued=false;

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))}
function scriptData(){return window.MTS_SHARED_SCRIPT_DATA||null}
function annotations(){return window.MTS_SHARED_LINE_ANNOTATIONS||null}
function dictionary(){return window.MTS_SHARED_WORD_DICTIONARY||null}
function speech(scene,id){return scriptData()?.[scene]?.speeches?.find(x=>x.id===id)||null}
function annotation(id){return annotations()?.[id]||null}
function norm(v){return String(v||'').trim().toLowerCase()}
function dictEntry(lemma){const d=dictionary();if(!d||!lemma)return null;return d[lemma]||d[Object.keys(d).find(k=>norm(k)===norm(lemma))]||null}
function vocabEntry(lineId,lemma,surface){const list=annotation(lineId)?.vocabulary;return Array.isArray(list)?list.find(v=>norm(v.lemma)===norm(lemma)&&(!surface||norm(v.surface)===norm(surface)))||list.find(v=>norm(v.lemma)===norm(lemma))||null:null}
function isWordChar(c){return !!c&&/[A-Za-z0-9'’\-]/.test(c)}
function candidateBoundary(text,start,end,surface){if(!surface)return false;const first=surface[0],last=surface[surface.length-1];if(isWordChar(first)&&isWordChar(text[start-1]))return false;if(isWordChar(last)&&isWordChar(text[end]))return false;return true}

function injectStyle(){if(document.getElementById('mts-reader-v2-style'))return;const style=document.createElement('style');style.id='mts-reader-v2-style';style.textContent=`
body.word-sheet-open{overflow:hidden}
.line-row .line-text{line-height:1.72}
.reader-vocab{display:inline;border-radius:.28em;padding:.02em .08em;margin:0 -.01em;background:linear-gradient(to top,rgba(232,190,97,.34) 0 46%,transparent 46% 100%);text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:3px;text-decoration-color:rgba(139,94,60,.72);cursor:pointer;-webkit-box-decoration-break:clone;box-decoration-break:clone;transition:background .12s ease,transform .12s ease}
.reader-vocab:hover{background:rgba(232,190,97,.30)}
.reader-vocab:active{background:rgba(232,190,97,.52)}
.word-sheet-backdrop{position:fixed;inset:0;z-index:65;display:flex;align-items:flex-end;justify-content:center;background:rgba(25,21,18,.35);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);animation:mtsWordBackdropIn .18s ease both}
.word-sheet-backdrop[hidden]{display:none!important}
.word-sheet{--word-drag:0px;position:relative;width:min(760px,100%);max-height:min(74dvh,720px);min-height:320px;background:#f7f5f0;border-radius:24px 24px 0 0;box-shadow:0 -18px 52px rgba(30,24,19,.24);overflow:hidden;transform:translateY(var(--word-drag));animation:mtsWordRise .22s cubic-bezier(.2,.82,.2,1) both;transition:transform .18s cubic-bezier(.2,.82,.2,1)}
.word-sheet.dragging{transition:none;animation:none}
.word-sheet-backdrop.closing{animation:mtsWordBackdropOut .18s ease both}
.word-sheet-backdrop.closing .word-sheet{animation:none;transform:translateY(105%)}
.word-sheet-handle{position:absolute;inset:0 0 auto 0;height:52px;z-index:3;display:flex;align-items:flex-start;justify-content:center;padding-top:9px;touch-action:none;background:linear-gradient(to bottom,rgba(247,245,240,.98),rgba(247,245,240,.78),transparent)}
.word-sheet-grabber{width:42px;height:5px;border-radius:999px;background:rgba(38,35,31,.26)}
.word-sheet-close{position:absolute;right:12px;top:8px;width:36px;height:36px;border:0;border-radius:999px;background:rgba(255,255,255,.88);color:#26231f;font-size:24px;line-height:1;box-shadow:0 4px 16px rgba(31,25,20,.10);cursor:pointer}
.word-sheet-content{max-height:min(74dvh,720px);overflow:auto;-webkit-overflow-scrolling:touch;padding:46px 16px calc(22px + env(safe-area-inset-bottom))}
.word-sheet-head{padding:12px 2px 4px}.word-sheet-head h2{font-size:30px;line-height:1.15;margin:.15em 0}.word-lemma{color:#736d65;font-size:14px}.word-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.word-meta span{display:inline-block;padding:5px 8px;border-radius:999px;background:#eee6dc;color:#5f574f;font-size:11px;font-weight:750}
.word-context-card,.word-dict-card{background:#fff;border:1px solid #ded8cf;border-radius:18px;padding:15px;margin-top:12px;box-shadow:0 8px 24px rgba(45,36,29,.07)}
.word-context-card .label,.word-dict-card .label{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8b5e3c;font-weight:900;margin-bottom:7px}.word-context-sentence{font-size:17px;line-height:1.65;font-weight:700;margin:0}.word-context-translation{font-size:15px;line-height:1.65;color:#5f574f;margin:9px 0 0;padding-top:9px;border-top:1px solid #eee8df}
.word-dict-grid{display:grid;grid-template-columns:max-content 1fr;gap:8px 12px;margin:0}.word-dict-grid dt{font-weight:800;color:#736d65}.word-dict-grid dd{margin:0;line-height:1.55}.word-sheet-empty{color:#a13d35;font-weight:800}
@keyframes mtsWordRise{from{transform:translateY(105%)}to{transform:translateY(0)}}
@keyframes mtsWordBackdropIn{from{background:rgba(25,21,18,0)}to{background:rgba(25,21,18,.35)}}
@keyframes mtsWordBackdropOut{from{background:rgba(25,21,18,.35)}to{background:rgba(25,21,18,0)}}
@media(max-width:600px){.word-sheet{max-height:78dvh;border-radius:22px 22px 0 0}.word-sheet-content{max-height:78dvh;padding-inline:13px}.word-sheet-head h2{font-size:27px}}
@media(prefers-reduced-motion:reduce){.word-sheet,.word-sheet-backdrop{animation:none!important;transition:none!important}}
`;document.head.appendChild(style)}

function makeRanges(text,vocab){const candidates=[];const lower=text.toLowerCase();for(const v of vocab){const surface=String(v?.surface||'').trim();if(!surface)continue;const needle=surface.toLowerCase();let from=0;while(from<=lower.length-needle.length){const start=lower.indexOf(needle,from);if(start<0)break;const end=start+needle.length;if(candidateBoundary(text,start,end,surface))candidates.push({start,end,v});from=start+Math.max(1,needle.length)}}candidates.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start));const selected=[];let end=0;for(const c of candidates){if(c.start<end)continue;selected.push(c);end=c.end}return selected}
function enhanceLine(row,scene){const id=row.dataset.line,textNode=row.querySelector('.line-text'),x=speech(scene,id),a=annotation(id);if(!textNode||!x||!a||textNode.dataset.readerV2==='1')return;const vocab=Array.isArray(a.vocabulary)?a.vocabulary:[],ranges=makeRanges(String(x.text||''),vocab),fragment=document.createDocumentFragment();let cursor=0;for(const r of ranges){if(r.start>cursor)fragment.append(document.createTextNode(x.text.slice(cursor,r.start)));const span=document.createElement('span');span.className='reader-vocab';span.dataset.scene=scene;span.dataset.line=id;span.dataset.lemma=String(r.v.lemma||'');span.dataset.surface=String(r.v.surface||x.text.slice(r.start,r.end));span.textContent=x.text.slice(r.start,r.end);span.title='辞書を開く';fragment.append(span);cursor=r.end}if(cursor<x.text.length)fragment.append(document.createTextNode(x.text.slice(cursor)));textNode.replaceChildren(fragment);textNode.dataset.readerV2='1'}
function enhanceReader(){enhanceQueued=false;if(!location.hash.startsWith('#/script'))return;const scene=localStorage.getItem(KEY.selectedScene)||'act1-scene1';app.querySelectorAll('.line-row[data-line]').forEach(row=>enhanceLine(row,scene))}
function queueEnhance(){if(enhanceQueued)return;enhanceQueued=true;requestAnimationFrame(enhanceReader)}

function setCurrent(scene,line){if(!speech(scene,line))return false;localStorage.setItem(KEY.selectedScene,scene);localStorage.setItem(KEY.lineCurrent,JSON.stringify({sceneId:scene,lineId:line}));return true}
function renderWord(scene,line,lemma,surface){const x=speech(scene,line),a=annotation(line),v=vocabEntry(line,lemma,surface),d=dictEntry(lemma);if(!x||!a){wordContent.innerHTML='<p class="word-sheet-empty">この単語の文脈情報を読み込めません。</p>';return}const translation=String(a.translation||''),display=surface||v?.surface||d?.lemma||lemma||'Word';const dl=[];const add=(k,val)=>{if(String(val||'').trim())dl.push(`<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`)};add('日本語',d?.contextMeaning||v?.meaning||d?.coreMeaning);add('Core',d?.coreMeaning);add('In this play',d?.contextExplanation);add('Forms',d?.forms);if(d?.pattern)add('Pattern',`${d.pattern}${d.patternDesc?` — ${d.patternDesc}`:''}`);wordContent.innerHTML=`<header class="word-sheet-head"><div class="eyebrow">Dictionary</div><h2>${esc(display)}</h2><div class="word-lemma">${esc(d?.lemma||lemma||'')}</div><div class="word-meta">${d?.pos?`<span>${esc(d.pos)}</span>`:''}${d?.ipa?`<span>${esc(d.ipa)}</span>`:''}</div></header><section class="word-context-card"><div class="label">In this line</div><p class="word-context-sentence">${esc(x.text)}</p><p class="word-context-translation">${esc(translation||'日本語訳はありません。')}</p></section><section class="word-dict-card"><div class="label">Word dictionary</div>${dl.length?`<dl class="word-dict-grid">${dl.join('')}</dl>`:`<p class="word-sheet-empty">辞書情報が見つかりません。</p>`}</section>`}
function openWord(scene,line,lemma,surface,source=null){if(!setCurrent(scene,line))return;clearTimeout(closeTimer);restoreFocus=source||document.activeElement;wordOverlay.classList.remove('closing');wordSheet.classList.remove('dragging');wordSheet.style.setProperty('--word-drag','0px');renderWord(scene,line,lemma,surface);wordOverlay.hidden=false;document.body.classList.add('word-sheet-open');wordContent.scrollTop=0}
function finishClose(){wordOverlay.hidden=true;wordOverlay.classList.remove('closing');wordSheet.classList.remove('dragging');wordSheet.style.setProperty('--word-drag','0px');document.body.classList.remove('word-sheet-open');const target=restoreFocus;restoreFocus=null;if(target?.isConnected)target.focus({preventScroll:true})}
function closeWord(animate=true){clearTimeout(closeTimer);if(wordOverlay.hidden){finishClose();return}if(!animate){finishClose();return}wordOverlay.classList.add('closing');document.body.classList.remove('word-sheet-open');closeTimer=setTimeout(finishClose,190)}

function interceptVocabulary(event){const target=event.target instanceof Element?event.target.closest('.reader-vocab'):null;if(!target||!location.hash.startsWith('#/script'))return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openWord(target.dataset.scene,target.dataset.line,target.dataset.lemma,target.dataset.surface,target)}
document.addEventListener('click',interceptVocabulary,true);

wordClose.addEventListener('click',()=>closeWord());
wordOverlay.addEventListener('click',event=>{if(event.target===wordOverlay)closeWord()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!wordOverlay.hidden){event.preventDefault();closeWord()}});

wordHandle.addEventListener('pointerdown',event=>{if(event.target instanceof Element&&event.target.closest('button'))return;drag={id:event.pointerId,startY:event.clientY,startT:performance.now()};wordSheet.classList.add('dragging');try{wordHandle.setPointerCapture(event.pointerId)}catch{}});
wordHandle.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;const dy=Math.max(0,event.clientY-drag.startY);wordSheet.style.setProperty('--word-drag',`${dy}px`)});
function endDrag(event){if(!drag||event.pointerId!==drag.id)return;const dy=Math.max(0,event.clientY-drag.startY),dt=Math.max(1,performance.now()-drag.startT),velocity=dy/dt;drag=null;wordSheet.classList.remove('dragging');if(dy>86||velocity>.62){closeWord();return}wordSheet.style.setProperty('--word-drag','0px')}
wordHandle.addEventListener('pointerup',endDrag);wordHandle.addEventListener('pointercancel',endDrag);

new MutationObserver(queueEnhance).observe(app,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#/script'))closeWord(false);queueEnhance()});
injectStyle();queueEnhance();
window.MTS_READER_V2=Object.freeze({enhance:enhanceReader,openWord,closeWord});
})();
