import json
from pathlib import Path
ROOT=Path.cwd()
def read(p): return (ROOT/p).read_text(encoding='utf-8')
def write(p,text):
    f=ROOT/p; f.parent.mkdir(parents=True,exist_ok=True); f.write_text(text if text.endswith('\n') else text+'\n',encoding='utf-8')
def rep(text,old,new,label):
    n=text.count(old)
    if n!=1: raise RuntimeError(f'{label}: expected 1 match, got {n}')
    return text.replace(old,new,1)
def line(text,prefix,fn,label):
    rows=text.split('\n'); hits=[i for i,x in enumerate(rows) if x.startswith(prefix)]
    if len(hits)!=1: raise RuntimeError(f'{label}: expected 1 line, got {len(hits)}')
    rows[hits[0]]=fn(rows[hits[0]]); return '\n'.join(rows)

s=read('app/src/config.js')
s=rep(s,"export const BUILD_ID = 'index-zero-2026-08-26-r5';","export const BUILD_ID = 'index-zero-2026-08-26-r6';",'config build')
s=rep(s,"  translations: './mousetrap_line_translations.json',\n  vocabulary:","  translations: './mousetrap_line_translations.json',\n  interpretation: './mousetrap_line_interpretation.json',\n  vocabulary:",'config path')
write('app/src/config.js',s)

s=read('app/src/data-store.js')
validator="""const INTERPRETATION_KINDS = new Set(['context','reaction','emotion','tone','joke','dramatic','reference','foreshadowing','truth','lie','concealment','feignedIgnorance','misdirection','evasion','mistakenBelief']);
function validateInterpretation(value) {
  validateSpeechMap(value, 'interpretation');
  for (const [lineId, notes] of Object.entries(value)) {
    if (!Array.isArray(notes)) throw new Error(`interpretation.${lineId}: array required`);
    const seen = new Set();
    for (const note of notes) {
      const kind = String(note?.kind || '');
      const text = String(note?.text || '').trim();
      if (!INTERPRETATION_KINDS.has(kind)) throw new Error(`interpretation.${lineId}: invalid kind ${kind}`);
      if (!text || text.length > 360) throw new Error(`interpretation.${lineId}: invalid text`);
      const key = `${kind}\\u0000${text}`;
      if (seen.has(key)) throw new Error(`interpretation.${lineId}: duplicate note`);
      seen.add(key);
    }
  }
  return value;
}

"""
s=rep(s,'function validateDictionary(value) {',validator+'function validateDictionary(value) {','validator')
s=rep(s,'this.script = null; this.translations = null; this.vocabulary = null; this.grammar = null; this.dictionary = null; this.structure = null;','this.script = null; this.translations = null; this.interpretation = null; this.vocabulary = null; this.grammar = null; this.dictionary = null; this.structure = null;','fields')
s=rep(s,"const specs = [['translations', DATA_PATHS.translations, value => validateSpeechMap(value, 'translations')], ['vocabulary', DATA_PATHS.vocabulary, value => validateSpeechMap(value, 'vocabulary')], ['grammar', DATA_PATHS.grammar, value => validateSpeechMap(value, 'grammar')], ['dictionary', DATA_PATHS.dictionary, validateDictionary]];","const specs = [['translations', DATA_PATHS.translations, value => validateSpeechMap(value, 'translations')], ['interpretation', DATA_PATHS.interpretation, validateInterpretation], ['vocabulary', DATA_PATHS.vocabulary, value => validateSpeechMap(value, 'vocabulary')], ['grammar', DATA_PATHS.grammar, value => validateSpeechMap(value, 'grammar')], ['dictionary', DATA_PATHS.dictionary, validateDictionary]];",'specs')
s=rep(s,'studySnapshot() { return { translations: this.translations, vocabulary: this.vocabulary, grammar: this.grammar, dictionary: this.dictionary }; }','studySnapshot() { return { translations: this.translations, interpretation: this.interpretation, vocabulary: this.vocabulary, grammar: this.grammar, dictionary: this.dictionary }; }','snapshot')
s=rep(s,'  getTranslationRecord(lineId) { return this.translations?.[lineId] || null; }\n  getVocabulary','  getTranslationRecord(lineId) { return this.translations?.[lineId] || null; }\n  getInterpretation(lineId) { return Array.isArray(this.interpretation?.[lineId]) ? this.interpretation[lineId] : []; }\n  getVocabulary','getter')
write('app/src/data-store.js',s)

s=read('app/src/main.js')
helper="""
const INTERPRETATION_LABELS=Object.freeze({joke:'Joke',foreshadowing:'Foreshadowing',truth:'Truth',lie:'Lie',concealment:'Concealment',feignedIgnorance:'Feigning ignorance',misdirection:'Misdirection',evasion:'Evasion',mistakenBelief:'Mistaken belief'});
function interpretationHtml(notes){if(!Array.isArray(notes)||!notes.length)return'';return `<div class="translation-interpretation"><div class="interpretation-kicker">Interpretation</div>${notes.map(note=>{const label=INTERPRETATION_LABELS[note.kind];return `<div class="interpretation-note">${label?`<span class="interpretation-badge" data-kind="${esc(note.kind)}">${esc(label)}</span>`:''}<p>${esc(note.text)}</p></div>`}).join('')}</div>`}"""
s=line(s,'function annotatedText',lambda x:x+helper,'helper')
s=line(s,'function searchKinds',lambda _:"function searchKinds(speech,term){const n=normalize(term),k=[];if(normalize(speech.text).includes(n))k.push('Line');if(normalize(speech.speaker).includes(n))k.push('Speaker');if(store.hasStudy()){if(normalize(store.getTranslation(speech.id)).includes(n))k.push('Translation');if(store.getInterpretation(speech.id).some(note=>normalize([note.kind,note.text].join(' ')).includes(n)))k.push('Interpretation');if(store.getVocabulary(speech.id).some(v=>normalize([v.surface,v.lemma,v.meaning].join(' ')).includes(n)))k.push('Vocabulary')}return k}",'search')
def lv(x):
    x=rep(x,"translation=study?store.getTranslation(line):'',grammar=","translation=study?store.getTranslation(line):'',interpretation=study?store.getInterpretation(line):[],grammar=",'line data')
    return rep(x,"${study?`<p class=\"translation\">${esc(translation||'No translation available.')}</p>`:store.studyState.status==='error'?","${study?`<p class=\"translation\">${esc(translation||'No translation available.')}</p>${interpretationHtml(interpretation)}`:store.studyState.status==='error'?",'line render')
s=line(s,'function lineView(q){',lv,'line view')
write('app/src/main.js',s)

s=read('app/src/app.css')
if '.translation-interpretation{' not in s:
    s+='''\n.translation-interpretation{margin-top:12px;padding-top:10px;border-top:1px solid var(--line,#ded7ca);font-size:.88rem;line-height:1.55;color:var(--muted,#625f58)}
.interpretation-kicker{font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px;color:var(--muted,#625f58)}
.interpretation-note+.interpretation-note{margin-top:8px}
.interpretation-note p{margin:3px 0 0}
.interpretation-badge{display:inline-flex;align-items:center;border:1px solid currentColor;border-radius:999px;padding:1px 7px;font-size:.68rem;font-weight:750;line-height:1.5;opacity:.82}
'''
write('app/src/app.css',s)

s=read('app/sw.js')
s=rep(s,"const BUILD_ID='index-zero-2026-08-26-r5';","const BUILD_ID='index-zero-2026-08-26-r6';",'sw build')
s=rep(s,"'mousetrap_script_data.json','mousetrap_line_translations.json','mousetrap_line_vocabulary.json',","'mousetrap_script_data.json','mousetrap_line_translations.json','mousetrap_line_interpretation.json','mousetrap_line_vocabulary.json',",'sw data')
write('app/sw.js',s)
write('app/pwa-version.json',json.dumps({'schemaVersion':2,'buildId':'index-zero-2026-08-26-r6','runtime':'index-zero','dataVersion':'canonical-2026-08-26-interpretation-v1'},indent=2))

s=read('app/tests/index_zero_static.mjs')
s=rep(s,"for(const term of ['loadCore','loadStudy','loadStructure','getSpeech','getVocabulary','getDictionary'])","for(const term of ['loadCore','loadStudy','loadStructure','getSpeech','getInterpretation','getVocabulary','getDictionary'])",'static api')
s=rep(s,"if(!main.includes('Full')||!main.includes('Mine')||!main.includes('Cue Focus')||!main.includes('Structure')||!main.includes('Grammar / Usage'))fail('reader/study feature parity missing');","if(!main.includes('Full')||!main.includes('Mine')||!main.includes('Cue Focus')||!main.includes('Structure')||!main.includes('Grammar / Usage')||!main.includes('translation-interpretation'))fail('reader/study feature parity missing');",'static ui')
s=rep(s,"if(!sw.includes(\"'./src/resume-bookmarks.js'\"))fail('Resume/Bookmarks runtime is missing from the offline shell cache');","if(!sw.includes(\"'./src/resume-bookmarks.js'\"))fail('Resume/Bookmarks runtime is missing from the offline shell cache');\nif(!sw.includes(\"mousetrap_line_interpretation.json\"))fail('Interpretation data is missing from the offline data cache');",'static sw')
write('app/tests/index_zero_static.mjs',s)

pkg=json.loads(read('app/package.json')); pkg['scripts']['test:e2e']='playwright test tests/index_zero.e2e.spec.js tests/resume_bookmarks.e2e.spec.js tests/gesture_english.e2e.spec.js tests/r5_behavior.e2e.spec.js tests/interpretation.e2e.spec.js --config=playwright.index-zero.config.js'; write('app/package.json',json.dumps(pkg,indent=2))

s=read('.github/workflows/pages.yml'); s=rep(s,'          test -e public/mousetrap_script_data.json\n          test -e public/mousetrap_line_structure.json','          test -e public/mousetrap_script_data.json\n          test -e public/mousetrap_line_interpretation.json\n          test -e public/mousetrap_line_structure.json','pages'); write('.github/workflows/pages.yml',s)
print(json.dumps({'status':'PASS','buildId':'index-zero-2026-08-26-r6'}))
