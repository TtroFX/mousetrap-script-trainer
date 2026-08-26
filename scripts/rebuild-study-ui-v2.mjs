import fs from 'node:fs';
import crypto from 'node:crypto';

const read = p => fs.readFileSync(p, 'utf8');
const write = (p, s) => { fs.mkdirSync(p.split('/').slice(0, -1).join('/') || '.', { recursive: true }); fs.writeFileSync(p, s.endsWith('\n') ? s : s + '\n'); };
const readJson = p => JSON.parse(read(p));
const writeJson = (p, v) => write(p, JSON.stringify(v, null, 2));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
function replaceExact(text, before, after, label) {
  const n = text.split(before).length - 1;
  if (n !== 1) throw new Error(label + ': expected 1 match, got ' + n);
  return text.replace(before, after);
}
function replaceRegex(text, pattern, after, label) {
  let count = 0;
  const out = text.replace(pattern, (...args) => { count += 1; return typeof after === 'function' ? after(...args) : after; });
  if (count !== 1) throw new Error(label + ': expected 1 match, got ' + count);
  return out;
}
const norm = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[「」『』“”‘’"'。、，,:：;；!！?？\s]/g, '');

// -----------------------------------------------------------------------------
// 1) Canonical dictionary cleanup: remove dead Pattern fields and generated
//    context paraphrases. Keep only genuinely additive context notes.
// -----------------------------------------------------------------------------
const dictionaryPath = 'mousetrap_word_dictionary.json';
const dictionary = readJson(dictionaryPath);
let patternFieldsRemoved = 0;
let redundantContextRemoved = 0;
let contextPrefixShortened = 0;
for (const entry of Object.values(dictionary)) {
  if (Object.prototype.hasOwnProperty.call(entry, 'pattern')) { delete entry.pattern; patternFieldsRemoved += 1; }
  if (Object.prototype.hasOwnProperty.call(entry, 'patternDesc')) { delete entry.patternDesc; patternFieldsRemoved += 1; }
  let context = String(entry.contextExplanation || '').trim();
  if (!context) { delete entry.contextExplanation; continue; }
  const original = context;
  context = context.replace(/^(?:劇中では|この劇では)[、,:：]?\s*/, '').trim();
  if (context !== original) contextPrefixShortened += 1;
  context = context.replace(/\s*前後関係からこの意味を取る。?\s*$/, '').trim();
  const contextMeaning = String(entry.contextMeaning || '').trim();
  const wrapped = context.match(/^(?:文脈に応じて)?[「『](.+?)[」』]の意味で使われる。?$/);
  if ((wrapped && norm(wrapped[1]) === norm(contextMeaning)) || (contextMeaning && norm(context) === norm(contextMeaning))) {
    delete entry.contextExplanation;
    redundantContextRemoved += 1;
  } else if (context) {
    entry.contextExplanation = context;
  } else {
    delete entry.contextExplanation;
    redundantContextRemoved += 1;
  }
}
writeJson(dictionaryPath, dictionary);
const dictionarySha = sha(dictionaryPath);

// Keep every canonical registry aligned with the cleaned dictionary bytes.
const contractPath = 'data/canonical-production-contract.json';
const contract = readJson(contractPath);
const dictContract = contract.files.find(x => x.path === dictionaryPath);
assert(dictContract, 'dictionary missing from canonical production contract');
const previousDictionarySha = dictContract.sha256;
dictContract.sha256 = dictionarySha;
writeJson(contractPath, contract);

const manifestPath = 'data/canonical-integration-manifest.json';
const manifest = readJson(manifestPath);
manifest.studyAssets ||= {};
manifest.studyAssets.wordDictionary ||= { file: dictionaryPath };
manifest.studyAssets.wordDictionary.sha256 = dictionarySha;
manifest.studyAssets.wordDictionary.presentation = {
  meaningPriority: ['lineVocabulary.meaning', 'dictionary.contextMeaning', 'dictionary.coreMeaning'],
  optionalFields: ['coreMeaning', 'contextExplanation', 'forms'],
  patternFields: 0,
  genericContextParaphrases: 0
};
manifest.chunking ||= {};
manifest.chunking.presentation = {
  rules: 'data/chunking-v1-presentation.md',
  contract: 'muted-semantic-span-v1',
  modules: ['app/src/study/structure-model.js', 'app/src/study/structure-view.js']
};
writeJson(manifestPath, manifest);

const reportPath = 'data/vocabulary-context-expansion-report.json';
const report = readJson(reportPath);
report.dictionary.sha256 = dictionarySha;
report.dictionary.presentation = {
  patternFields: 0,
  genericContextParaphrases: 0,
  removedPatternProperties: patternFieldsRemoved,
  removedRedundantContextExplanations: redundantContextRemoved,
  shortenedContextPrefixes: contextPrefixShortened
};
writeJson(reportPath, report);

for (const p of ['materials/005_VOCABULARY_CORE.txt']) {
  let text = read(p);
  text = text.replaceAll(previousDictionarySha, dictionarySha);
  if (!text.includes('Dictionary presentation:')) text = text.replace('Join: exact case-insensitive lemma from 006 line vocabulary.', 'Join: exact case-insensitive lemma from 006 line vocabulary.\nDictionary presentation: line-specific meaning first; no Pattern field; context notes only when additive.');
  write(p, text);
}

// -----------------------------------------------------------------------------
// 2) Future vocabulary expansion must preserve the current presentation contract.
// -----------------------------------------------------------------------------
let expand = read('scripts/expand-play-context-vocabulary.mjs');
expand = replaceExact(expand,
  "    const item = { surface, lemma, meaning, _priority: priority, _source: source };",
  "    const playMeaning = source === 'contextualReviewed' ? true : source === 'neutralPromoted' ? false : raw?.playMeaning === true;\n    const item = { surface, lemma, meaning, playMeaning, _priority: priority, _source: source };",
  'expansion insert playMeaning');
expand = replaceExact(expand,
  "    existing.meaning = meaning;\n    existing._priority = priority;",
  "    existing.meaning = meaning;\n    existing.playMeaning = source === 'contextualReviewed' ? true : source === 'neutralPromoted' ? false : raw?.playMeaning === true;\n    existing._priority = priority;",
  'expansion update playMeaning');
expand = replaceExact(expand,
  "        contextMeaning,\n        contextExplanation: `劇中では文脈に応じて「${contextMeaning}」の意味で使われる。`,\n        pattern: item.lemma.includes(' ') ? item.lemma : '',\n        patternDesc: item.lemma.includes(' ') ? '語をばらばらにせず、まとまりとして理解する。' : '',\n        tags: neutral.tags || []",
  "        contextMeaning,\n        tags: neutral.tags || []",
  'expansion remove generated dictionary prose');
expand = replaceExact(expand,
  "      if (!String(entry.contextExplanation || '').trim()) { entry.contextExplanation = `劇中では文脈に応じて「${entry.contextMeaning}」の意味で使われる。`; changed = true; }\n",
  '',
  'expansion remove context filler');
assert(!expand.includes('patternDesc'), 'patternDesc still generated');
assert(!expand.includes('劇中では文脈に応じて'), 'generic context generator still present');
write('scripts/expand-play-context-vocabulary.mjs', expand);

// -----------------------------------------------------------------------------
// 3) Persist the approved visual contract that was previously decided with the
//    image/mockup work. Runtime implementation is checked against this contract.
// -----------------------------------------------------------------------------
write('data/chunking-v1-presentation.md', String.raw`# Chunking v1 — canonical presentation contract

Status: CANONICAL FOR APP PRESENTATION

The structural source of truth is \`app/mousetrap_line_structure.json\` and \`data/chunking-v1-rules.md\`. The UI must never re-parse or reinterpret the English.

## Visual principles

- English text remains black/dark ink. Semantic color belongs to small marker labels and thin underlines/rails, not to large filled blocks.
- Use a restrained palette: muted blue for S, amber for V/HV, green for O, mauve for C, and slate/taupe for connectors/modifiers/fallback markers.
- Do not create a rainbow grammar view, colored sentence backgrounds, bracket forests, or developer-style tree dumps.
- Structure is compact and collapsed by default in Line Detail. Expanded Structure must remain readable on phone and tablet widths.
- Chunks follow the original left-to-right text and wrap naturally. Never reorder words or fabricate omitted words.
- Clause nesting is shown only from canonical \`parentClauseId\`. Do not infer visual nesting from offsets alone.
- A nested clause's outer S/O/C relation is shown from the canonical relation chunk / \`functionInParent\`; relation chunks are not duplicated as a second colored text chunk.
- Fragment / response / vocative / interjection analysis remains first-class and is not forced into S/V/O/C.

## Information hierarchy

1. sentence text;
2. thin clause rail + clause marker/name;
3. marker label + black English chunk with a semantic underline;
4. optional click detail for marker meaning and clause membership.

No legacy \`role/type\` projection is permitted.
`);

// -----------------------------------------------------------------------------
// 4) New Structure domain model. No HTML and no dependency on the old renderer.
// -----------------------------------------------------------------------------
write('app/src/study/structure-model.js', String.raw`const CLAUSE_LABELS = Object.freeze({
  BC: 'Main clause',
  AC: 'Adverbial clause',
  NC: 'Noun / content clause',
  RC: 'Relative clause'
});

const MARKER_LABELS = Object.freeze({
  S: 'Subject', V: 'Verb', O: 'Object', C: 'Complement', HV: 'Auxiliary',
  ACC: 'Subordinator', Conj: 'Coordinator', N: 'Noun unit', Adj: 'Adjectival',
  Adv: 'Adverbial', Prep: 'Prepositional phrase', Voc: 'Vocative',
  Int: 'Interjection', Resp: 'Response', Frag: 'Fragment', Other: 'Other'
});

export function markerBase(marker) {
  return String(marker || '').replace(/\d+[a-z]?$/i, '');
}

export function markerLabel(marker) {
  const base = markerBase(marker);
  return MARKER_LABELS[base] || base || 'Chunk';
}

export function clauseLabel(marker) {
  const base = String(marker || '').replace(/\d+$/, '');
  return CLAUSE_LABELS[base] || base || 'Clause';
}

function depthOf(clause, byId) {
  let depth = 0;
  let current = clause;
  const seen = new Set();
  while (current && current.parentClauseId && byId.has(current.parentClauseId) && !seen.has(current.parentClauseId)) {
    seen.add(current.parentClauseId);
    depth += 1;
    current = byId.get(current.parentClauseId);
  }
  return depth;
}

function chunkModel(chunk, sentenceText) {
  return Object.freeze({
    id: chunk.id,
    marker: chunk.marker,
    base: markerBase(chunk.marker),
    label: markerLabel(chunk.marker),
    layer: chunk.layer || '',
    clauseId: chunk.clauseId || null,
    nestedClauseId: chunk.nestedClauseId || null,
    source: chunk.source || '',
    start: chunk.start,
    end: chunk.end,
    text: sentenceText.slice(chunk.start, chunk.end)
  });
}

export function buildStructureModel(speech, line) {
  if (!speech || !line || !Array.isArray(line.sentences)) return Object.freeze({ sentences: [] });
  const sentences = line.sentences.map((sentence, sentenceIndex) => {
    const sentenceText = speech.text.slice(sentence.start, sentence.end);
    const clauses = Array.isArray(sentence.clauses) ? sentence.clauses : [];
    const chunks = Array.isArray(sentence.chunks) ? sentence.chunks : [];
    const byId = new Map(clauses.map(clause => [clause.id, clause]));
    const relationByNested = new Map();
    for (const chunk of chunks) if (chunk.source === 'relation' && chunk.nestedClauseId) relationByNested.set(chunk.nestedClauseId, chunk);

    const clauseModels = clauses.map(clause => {
      const relation = relationByNested.get(clause.id) || null;
      const ownChunks = chunks
        .filter(chunk => chunk.clauseId === clause.id && chunk.source !== 'relation')
        .slice()
        .sort((a, b) => a.start - b.start || a.end - b.end)
        .map(chunk => chunkModel(chunk, sentenceText));
      const parent = clause.parentClauseId ? byId.get(clause.parentClauseId) : null;
      return Object.freeze({
        id: clause.id,
        marker: clause.marker,
        label: clauseLabel(clause.marker),
        type: clause.type,
        depth: depthOf(clause, byId),
        parentClauseId: clause.parentClauseId || null,
        parentMarker: parent ? parent.marker : '',
        functionInParent: clause.functionInParent || '',
        outerRole: relation ? relation.marker : '',
        start: clause.start,
        end: clause.end,
        chunks: Object.freeze(ownChunks)
      });
    });

    const loose = chunks
      .filter(chunk => chunk.source !== 'relation' && (!chunk.clauseId || !byId.has(chunk.clauseId)))
      .slice()
      .sort((a, b) => a.start - b.start || a.end - b.end)
      .map(chunk => chunkModel(chunk, sentenceText));

    return Object.freeze({
      id: sentence.id,
      index: sentenceIndex,
      kind: sentence.kind,
      start: sentence.start,
      end: sentence.end,
      text: sentenceText,
      clauses: Object.freeze(clauseModels),
      loose: Object.freeze(loose)
    });
  });
  return Object.freeze({ sentences: Object.freeze(sentences) });
}
`);

// -----------------------------------------------------------------------------
// 5) New Structure renderer: approved muted span design, explicit hierarchy only.
// -----------------------------------------------------------------------------
write('app/src/study/structure-view.js', String.raw`import { buildStructureModel, markerBase, markerLabel } from './structure-model.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const classToken = marker => markerBase(marker).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'other';

function renderChunk(chunk, sentenceIndex) {
  return '<button type="button" class="syntax-chunk syntax-kind-' + classToken(chunk.marker) + '" data-syntax-chunk-id="' + escapeHtml(chunk.id) + '" data-syntax-sentence="' + sentenceIndex + '" data-marker="' + escapeHtml(chunk.marker) + '">' +
    '<span class="syntax-chunk-marker">' + escapeHtml(chunk.marker) + '</span>' +
    '<span class="syntax-chunk-text">' + escapeHtml(chunk.text) + '</span>' +
  '</button>';
}

function renderClause(clause, sentenceIndex) {
  const relation = clause.outerRole ? '<span class="syntax-clause-relation">as ' + escapeHtml(clause.outerRole) + '</span>' :
    (clause.functionInParent ? '<span class="syntax-clause-relation">' + escapeHtml(clause.functionInParent) + (clause.parentMarker ? ' in ' + escapeHtml(clause.parentMarker) : '') + '</span>' : '');
  return '<section class="syntax-clause" data-clause-marker="' + escapeHtml(clause.marker) + '" data-syntax-depth="' + clause.depth + '" style="--syntax-depth:' + clause.depth + '">' +
    '<header class="syntax-clause-head"><span class="syntax-clause-marker">' + escapeHtml(clause.marker) + '</span><span class="syntax-clause-name">' + escapeHtml(clause.label) + '</span>' + relation + '</header>' +
    '<div class="syntax-chunks">' + clause.chunks.map(chunk => renderChunk(chunk, sentenceIndex)).join('') + '</div>' +
  '</section>';
}

function renderSentence(sentence) {
  const clauses = sentence.clauses.map(clause => renderClause(clause, sentence.index)).join('');
  const loose = sentence.loose.length ? '<section class="syntax-clause syntax-fragment" data-syntax-depth="0" style="--syntax-depth:0"><header class="syntax-clause-head"><span class="syntax-clause-marker">' + (sentence.kind === 'fragment' ? 'Frag' : 'Other') + '</span><span class="syntax-clause-name">' + (sentence.kind === 'fragment' ? 'Dialogue fragment' : 'Unattached structure') + '</span></header><div class="syntax-chunks">' + sentence.loose.map(chunk => renderChunk(chunk, sentence.index)).join('') + '</div></section>' : '';
  return '<section class="syntax-sentence" data-syntax-sentence-index="' + sentence.index + '">' +
    '<div class="syntax-sentence-label">Sentence ' + (sentence.index + 1) + '</div>' +
    '<p class="syntax-source">' + escapeHtml(sentence.text) + '</p>' +
    '<div class="syntax-map">' + clauses + loose + '</div>' +
    '<div class="syntax-detail" data-syntax-detail="' + sentence.index + '" hidden></div>' +
  '</section>';
}

export function renderStructure(speech, line) {
  const model = buildStructureModel(speech, line);
  if (!model.sentences.length) return '<p class="muted">Structure is unavailable.</p>';
  return '<div class="syntax-view" data-syntax-view>' + model.sentences.map(renderSentence).join('') +
    '<div class="syntax-legend" aria-label="Structure key"><span><b>S</b> Subject</span><span><b>V</b> Verb</span><span><b>O</b> Object</span><span><b>C</b> Complement</span><span><b>HV</b> Auxiliary</span></div></div>';
}

export function bindStructureInteractions(root, speech, line) {
  if (!root || !speech || !line) return;
  const sentenceByChunk = new Map();
  for (const sentence of line.sentences || []) {
    for (const chunk of sentence.chunks || []) sentenceByChunk.set(chunk.id, { sentence, chunk });
  }
  root.querySelectorAll('[data-syntax-chunk-id]').forEach(button => {
    button.addEventListener('click', () => {
      const found = sentenceByChunk.get(button.dataset.syntaxChunkId);
      if (!found) return;
      const sentenceIndex = Number(button.dataset.syntaxSentence);
      const box = root.querySelector('[data-syntax-detail="' + sentenceIndex + '"]');
      if (!box) return;
      const clause = (found.sentence.clauses || []).find(item => item.id === found.chunk.clauseId) || null;
      const sentenceText = speech.text.slice(found.sentence.start, found.sentence.end);
      const title = document.createElement('strong');
      title.textContent = found.chunk.marker + ' · ' + markerLabel(found.chunk.marker);
      const phrase = document.createElement('span');
      phrase.className = 'syntax-detail-text';
      phrase.textContent = sentenceText.slice(found.chunk.start, found.chunk.end);
      const meta = document.createElement('small');
      meta.textContent = clause ? clause.marker + ' · ' + String(clause.type || '').toUpperCase() : 'Dialogue fragment';
      box.replaceChildren(title, phrase, meta);
      box.hidden = false;
    });
  });
}
`);

// -----------------------------------------------------------------------------
// 6) Dictionary sheet rebuilt as a dedicated view module.
// -----------------------------------------------------------------------------
write('app/src/study/dictionary-sheet.js', String.raw`const comparable = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[「」『』“”‘’"'。、，,:：;；!！?？\s]/g, '');
const sameText = (a, b) => !!String(a || '').trim() && !!String(b || '').trim() && comparable(a) === comparable(b);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function createDictionarySheet({ store, normalize, setStatus, openLine }) {
  const overlay = document.getElementById('word-overlay');
  const content = document.getElementById('word-content');
  const closeButton = document.getElementById('word-close');

  function close() {
    window.MTS_GESTURES?.resetSheet?.();
    overlay.hidden = true;
  }

  async function open(line, lemma, surface) {
    const speech = store.getSpeechById(line);
    if (!speech) return;
    if (!store.hasStudy()) {
      setStatus('Loading dictionary…');
      try { await store.loadStudy(); setStatus(); }
      catch { setStatus('Dictionary data could not be loaded.', 'warning'); return; }
    }

    const entry = store.getDictionary(lemma);
    const shown = store.getVocabulary(line);
    const vocab = shown.find(v => normalize(v.lemma) === normalize(lemma) && (!surface || normalize(v.surface) === normalize(surface))) || shown.find(v => normalize(v.lemma) === normalize(lemma));
    const scene = store.getSceneIdForSpeech(line);
    const meaning = String(vocab?.meaning || entry?.contextMeaning || entry?.coreMeaning || '').trim();
    const core = String(entry?.coreMeaning || '').trim();
    const contextNote = String(entry?.contextExplanation || '').trim();
    const forms = String(entry?.forms || '').trim();

    const header = el('header');
    header.append(el('div', 'eyebrow', 'Dictionary'));
    header.append(el('h2', '', surface || vocab?.surface || entry?.lemma || lemma));
    const meta = [entry?.lemma || lemma, entry?.pos, entry?.ipa].filter(Boolean).join(' · ');
    header.append(el('p', '', meta));

    const dictionaryCard = el('section', 'word-dict-card');
    dictionaryCard.append(el('h3', '', 'Word dictionary'));
    const dl = el('dl');
    const add = (label, value) => {
      const text = String(value || '').trim();
      if (!text) return;
      dl.append(el('dt', '', label), el('dd', '', text));
    };
    add('Meaning', meaning);
    if (core && !sameText(core, meaning)) add('Core', core);
    if (contextNote && !sameText(contextNote, meaning) && !sameText(contextNote, core)) add('Context', contextNote);
    add('Forms', forms);
    if (dl.children.length) dictionaryCard.append(dl);
    else dictionaryCard.append(el('p', 'muted', 'Dictionary information not found.'));

    const contextCard = el('section', 'word-context-card');
    contextCard.append(el('h3', '', 'In this line'));
    contextCard.append(el('p', 'context-en', speech.text));
    contextCard.append(el('p', '', store.getTranslation(line) || 'No translation available.'));
    const openButton = el('button', 'ghost-btn', 'Open Line Detail');
    openButton.type = 'button';
    openButton.addEventListener('click', () => { close(); openLine(scene, line); });
    contextCard.append(openButton);

    content.replaceChildren(header, dictionaryCard, contextCard);
    window.MTS_GESTURES?.resetSheet?.();
    overlay.hidden = false;
  }

  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !overlay.hidden) close(); });
  return Object.freeze({ open, close });
}
`);

// -----------------------------------------------------------------------------
// 7) Approved visual implementation. Semantic color is deliberately restrained.
// -----------------------------------------------------------------------------
write('app/src/study/study.css', String.raw`.structure-summary{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.structure-summary small{font-size:10px;color:var(--muted);font-weight:650}.syntax-view{margin-top:10px}.syntax-sentence{border-top:1px solid #eee6dd;padding:14px 0}.syntax-sentence:first-child{border-top:0}.syntax-sentence-label{font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}.syntax-source{margin:0 0 10px;color:var(--ink);font:650 16px/1.62 Georgia,"Times New Roman",serif}.syntax-map{display:grid;gap:7px;max-width:100%;overflow:hidden}.syntax-clause{--syntax-depth:0;margin-left:calc(var(--syntax-depth)*12px);padding-left:9px;border-left:1.5px solid #d9d0c6;min-width:0}.syntax-fragment{border-left-style:dashed}.syntax-clause-head{display:flex;align-items:baseline;gap:7px;min-height:18px;flex-wrap:wrap}.syntax-clause-marker{font-size:10px;font-weight:950;color:#65574c}.syntax-clause-name{font-size:10px;color:var(--muted)}.syntax-clause-relation{font-size:9px;color:#8a7c70}.syntax-chunks{display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px 10px;padding:4px 0 3px;min-width:0}.syntax-chunk{--syntax-accent:#6d777f;display:inline-grid;grid-template-rows:auto auto;gap:1px;max-width:100%;min-width:0;border:0;border-bottom:2px solid var(--syntax-accent);border-radius:0;background:transparent;padding:2px 1px 3px;text-align:left;color:var(--ink);box-shadow:none}.syntax-chunk:hover,.syntax-chunk:focus-visible{background:rgba(117,109,100,.06);outline:none}.syntax-chunk-marker{font-size:9px;line-height:1;font-weight:950;color:var(--syntax-accent)}.syntax-chunk-text{color:var(--ink);font:650 14px/1.42 Georgia,"Times New Roman",serif;overflow-wrap:anywhere}.syntax-kind-s{--syntax-accent:#5f7893}.syntax-kind-v{--syntax-accent:#a27638}.syntax-kind-hv{--syntax-accent:#a27638}.syntax-kind-o{--syntax-accent:#617f68}.syntax-kind-c{--syntax-accent:#846c82}.syntax-kind-acc,.syntax-kind-conj{--syntax-accent:#8a7c70}.syntax-kind-n,.syntax-kind-adj,.syntax-kind-adv,.syntax-kind-prep,.syntax-kind-voc,.syntax-kind-int,.syntax-kind-resp,.syntax-kind-frag,.syntax-kind-other{--syntax-accent:#6d777f}.syntax-detail{display:grid;gap:3px;margin-top:9px;border-left:2px solid #d8cec3;padding:7px 9px;color:var(--muted);font-size:11px}.syntax-detail strong{color:var(--ink);font-size:11px}.syntax-detail-text{color:var(--ink);font:650 14px/1.45 Georgia,"Times New Roman",serif}.syntax-detail small{color:var(--muted)}.syntax-legend{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:11px;color:var(--muted);font-size:9px}.syntax-legend b{color:var(--ink)}@media(max-width:680px){.syntax-clause{margin-left:calc(var(--syntax-depth)*8px);padding-left:7px}.syntax-chunks{gap:6px 8px}.syntax-chunk-text{font-size:13px}.syntax-source{font-size:15px}}`);

// -----------------------------------------------------------------------------
// 8) main.js: delete the old Structure/Dictionary implementations and bind the
//    new dedicated modules. No compatibility renderer remains.
// -----------------------------------------------------------------------------
let main = read('app/src/main.js');
main = replaceExact(main,
  "import './gesture-controls.js';",
  "import './gesture-controls.js';\nimport { renderStructure, bindStructureInteractions } from './study/structure-view.js';\nimport { createDictionarySheet } from './study/dictionary-sheet.js';",
  'main study imports');
main = replaceExact(main,
  "const resumeBookmarks=new ResumeBookmarksUI({app,store,state,go,chrome,sceneMeta,esc});",
  "const resumeBookmarks=new ResumeBookmarksUI({app,store,state,go,chrome,sceneMeta,esc});\nconst dictionarySheet=createDictionarySheet({store,normalize,setStatus,openLine});",
  'main dictionary sheet init');
main = replaceRegex(main, /const STRUCTURE_MARKER_LABELS=.*?\nfunction openLine/s, 'function openLine', 'remove old Structure renderer');
main = replaceRegex(main, /async function openWordSheet\(.*?\nfunction hintText/s, 'function hintText', 'remove old Dictionary renderer');
main = main.replaceAll('openWordSheet(', 'dictionarySheet.open(');
main = main.replaceAll('structureHtml(speech,structure)', 'renderStructure(speech,structure)');
main = replaceRegex(main, /app\.querySelectorAll\('\[data-structure-info\]'\)\.forEach\(b=>b\.onclick=.*?\}\);if\(!study/s, 'bindStructureInteractions(app,speech,structure);if(!study', 'replace old Structure interaction');
main = replaceExact(main,
  "document.getElementById('word-close').onclick=closeWordSheet;document.getElementById('word-overlay').onclick=e=>{if(e.target.id==='word-overlay')closeWordSheet()};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('word-overlay').hidden)closeWordSheet()});",
  '',
  'remove old dictionary global handlers');
for (const forbidden of ['STRUCTURE_MARKER_LABELS','structureSentenceModel','structureChunkHtml','structureHtml(','data-structure-info','openWordSheet','closeWordSheet','c.role','c.type']) assert(!main.includes(forbidden), 'legacy main implementation survived: ' + forbidden);
assert(main.includes("from './study/structure-view.js'"), 'new structure module import missing');
assert(main.includes('dictionarySheet.open('), 'dictionary sheet not wired');
write('app/src/main.js', main);

// -----------------------------------------------------------------------------
// 9) CSS: remove the old Structure implementation completely and import the new
//    dedicated stylesheet.
// -----------------------------------------------------------------------------
let css = read('app/src/app.css');
if (!css.startsWith("@import url('./study/study.css');")) css = "@import url('./study/study.css');" + css;
css = css.replace(';--s:#5f7893;--v:#a27638;--o:#617f68;--c:#846c82;--m:#6d777f', '');
css = replaceRegex(css, /\.structure-sentence\{.*?(?=\.floating-nav\{)/s, '', 'remove old Structure CSS');
for (const forbidden of ['.structure-sentence{','.structure-clause{','.structure-chunk{','.structure-info{','.structure-key{']) assert(!css.includes(forbidden), 'old Structure CSS survived: ' + forbidden);
write('app/src/app.css', css);

// -----------------------------------------------------------------------------
// 10) DataStore validators: canonical dictionary contract + exact Structure
//     reference/offset integrity against the loaded script.
// -----------------------------------------------------------------------------
let data = read('app/src/data-store.js');
const dictionaryValidator = String.raw`function validateDictionary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('dictionary: object required');
  if (Object.keys(value).length < 578) throw new Error('dictionary: unexpectedly small (' + Object.keys(value).length + ')');
  for (const [key, entry] of Object.entries(value)) {
    if (!String(key).trim() || !entry || typeof entry !== 'object' || !String(entry.coreMeaning || '').trim()) throw new Error('dictionary: invalid entry ' + key);
    if (Object.prototype.hasOwnProperty.call(entry, 'pattern') || Object.prototype.hasOwnProperty.call(entry, 'patternDesc')) throw new Error('dictionary: Pattern fields are forbidden (' + key + ')');
    const context = String(entry.contextExplanation || '').trim();
    if (/^(?:劇中では|この劇では)/.test(context) || /前後関係からこの意味を取る。?$/.test(context)) throw new Error('dictionary: generic context prose is forbidden (' + key + ')');
  }
  return value;
}`;
data = replaceRegex(data, /function validateDictionary\(value\) \{.*?\n\}/s, dictionaryValidator, 'replace dictionary validator');
const structureValidator = String.raw`function validateStructure(value, script) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('structure: object required');
  if (value.schemaVersion !== 2 || value.ruleSet !== 'chunking-v1') throw new Error('structure: chunking-v1 schema required');
  if ('rawLines' in value) throw new Error('structure: legacy rawLines/fallback is forbidden');
  if (!script) throw new Error('structure: canonical script must be loaded first');
  const counts = value.counts || {};
  if (counts.speeches !== 1164 || counts.sentences !== 2334 || counts.clauses !== 2939 || counts.chunks !== 11810) throw new Error('structure: canonical counts invalid');
  const lines = value.lines;
  if (!lines || typeof lines !== 'object' || Array.isArray(lines)) throw new Error('structure.lines: object required');
  const expected = expectedSpeechIds();
  const keys = Object.keys(lines);
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) throw new Error('structure.lines: speech IDs/order invalid');
  const speechById = new Map();
  for (const scene of SCENES) for (const speech of script[scene.id]?.speeches || []) speechById.set(speech.id, speech);
  const clauseMarker = /^(BC|AC|NC|RC)\d+$/;
  const roleMarker = /^(S|V|O|C)(\d+)[a-z]?$/;
  const allowedUnnumbered = new Set(['HV','ACC','Conj','N','Adj','Adv','Prep','Voc','Int','Resp','Frag','Other']);
  for (const lineId of expected) {
    const line = lines[lineId], speech = speechById.get(lineId);
    if (!speech || !line || line.speechLength !== speech.text.length || !Array.isArray(line.sentences) || !line.sentences.length) throw new Error('structure.' + lineId + ': invalid line/script binding');
    let previousSentenceEnd = 0;
    for (const sentence of line.sentences) {
      if (!Number.isInteger(sentence.start) || !Number.isInteger(sentence.end) || sentence.start < previousSentenceEnd || sentence.end <= sentence.start || sentence.end > line.speechLength) throw new Error('structure.' + lineId + ': invalid sentence span');
      if (speech.text.slice(previousSentenceEnd, sentence.start).trim()) throw new Error('structure.' + lineId + ': non-whitespace sentence gap');
      previousSentenceEnd = sentence.end;
      if (!['sentence','fragment'].includes(sentence.kind) || !Array.isArray(sentence.clauses) || !Array.isArray(sentence.chunks)) throw new Error('structure.' + lineId + ': invalid sentence payload');
      const sentenceLength = sentence.end - sentence.start;
      const clauseIds = new Set();
      const clauseById = new Map();
      const clauseNumbers = new Set();
      for (const clause of sentence.clauses) {
        if (!clause?.id || clauseIds.has(clause.id) || !clauseMarker.test(String(clause.marker || ''))) throw new Error('structure.' + lineId + ': invalid/duplicate clause');
        if (!Number.isInteger(clause.start) || !Number.isInteger(clause.end) || clause.start < 0 || clause.end <= clause.start || clause.end > sentenceLength) throw new Error('structure.' + lineId + ': invalid clause span');
        if (clause.marker !== String(clause.type) + String(clause.number)) throw new Error('structure.' + lineId + ': clause marker/type/number mismatch');
        clauseIds.add(clause.id); clauseById.set(clause.id, clause); clauseNumbers.add(String(clause.number));
      }
      for (const clause of sentence.clauses) {
        if (clause.parentClauseId === clause.id) throw new Error('structure.' + lineId + ': self-parent clause');
        if (clause.parentClauseId != null) {
          const parent = clauseById.get(clause.parentClauseId);
          if (!parent) throw new Error('structure.' + lineId + ': orphan clause parent');
          if (parent.start > clause.start || parent.end < clause.end) throw new Error('structure.' + lineId + ': nested clause outside parent');
        }
      }
      const relationByNested = new Map();
      for (const chunk of sentence.chunks) {
        const marker = String(chunk?.marker || '');
        if (chunk.clauseId != null && !clauseIds.has(chunk.clauseId)) throw new Error('structure.' + lineId + ': orphan chunk clause ' + chunk.clauseId);
        if (chunk.nestedClauseId != null && !clauseIds.has(chunk.nestedClauseId)) throw new Error('structure.' + lineId + ': orphan nested clause ' + chunk.nestedClauseId);
        if (!Number.isInteger(chunk.start) || !Number.isInteger(chunk.end) || chunk.start < 0 || chunk.end <= chunk.start || chunk.end > sentenceLength) throw new Error('structure.' + lineId + ': invalid chunk span');
        const role = marker.match(roleMarker);
        if (!role && !allowedUnnumbered.has(marker)) throw new Error('structure.' + lineId + ': unknown marker ' + marker);
        if (/^(Vi|Vt)/.test(marker) || marker.includes('VBN') || /^HV\d/.test(marker)) throw new Error('structure.' + lineId + ': legacy marker ' + marker);
        if (role) {
          if (!clauseNumbers.has(role[2])) throw new Error('structure.' + lineId + ': role marker without clause ' + marker);
          const owner = clauseById.get(chunk.clauseId);
          if (!owner || String(owner.number) !== role[2]) throw new Error('structure.' + lineId + ': role marker/owner mismatch ' + marker);
        }
        if (chunk.source === 'relation') {
          if (!chunk.nestedClauseId || !/^[SOC]\d+[a-z]?$/.test(marker)) throw new Error('structure.' + lineId + ': invalid relation chunk');
          const nested = clauseById.get(chunk.nestedClauseId);
          if (!nested || nested.parentClauseId !== chunk.clauseId || nested.start !== chunk.start || nested.end !== chunk.end) throw new Error('structure.' + lineId + ': relation/nested span mismatch');
          relationByNested.set(chunk.nestedClauseId, chunk);
        }
      }
      for (const clause of sentence.clauses) {
        if (['S','O','C'].includes(clause.functionInParent)) {
          const relation = relationByNested.get(clause.id);
          if (!relation || !String(relation.marker).startsWith(clause.functionInParent)) throw new Error('structure.' + lineId + ': missing outer role relation for ' + clause.marker);
        }
      }
    }
    if (speech.text.slice(previousSentenceEnd).trim()) throw new Error('structure.' + lineId + ': trailing unstructured text');
  }
  return value;
}`;
data = replaceRegex(data, /function validateStructure\(value\) \{.*?\n\}\n\nexport class DataStore/s, structureValidator + '\n\nexport class DataStore', 'replace Structure validator');
data = replaceExact(data, 'this.structure = validateStructure(await fetchJson(DATA_PATHS.structure, STRUCTURE_TIMEOUT_MS));', 'this.structure = validateStructure(await fetchJson(DATA_PATHS.structure, STRUCTURE_TIMEOUT_MS), this.script);', 'wire script-aware Structure validation');
write('app/src/data-store.js', data);

// -----------------------------------------------------------------------------
// 11) Production assembly contract: forbid dead dictionary schema and require all
//     new runtime modules.
// -----------------------------------------------------------------------------
let assembly = read('app/scripts/assemble-production.mjs');
assembly = replaceExact(assembly,
  "const dictionaryKeys=new Set(Object.keys(dictionary).map(x=>x.trim().toLowerCase()));\nfor(const rows of Object.values(vocabulary))for(const entry of rows)if(!dictionaryKeys.has(String(entry.lemma||'').trim().toLowerCase()))fail(`missing dictionary lemma ${entry.lemma}`);",
  "const dictionaryKeys=new Set(Object.keys(dictionary).map(x=>x.trim().toLowerCase()));\nfor(const [lemma,entry] of Object.entries(dictionary)){if(!entry||typeof entry!=='object'||!String(entry.coreMeaning||'').trim())fail(`invalid dictionary ${lemma}`);if(Object.prototype.hasOwnProperty.call(entry,'pattern')||Object.prototype.hasOwnProperty.call(entry,'patternDesc'))fail(`dictionary Pattern fields forbidden: ${lemma}`);const context=String(entry.contextExplanation||'').trim();if(/^(?:劇中では|この劇では)/.test(context)||/前後関係からこの意味を取る。?$/.test(context))fail(`generic dictionary context forbidden: ${lemma}`);}\nfor(const rows of Object.values(vocabulary))for(const entry of rows)if(!dictionaryKeys.has(String(entry.lemma||'').trim().toLowerCase()))fail(`missing dictionary lemma ${entry.lemma}`);",
  'assembler dictionary presentation validation');
assembly = replaceExact(assembly,
  "for(const file of ['src/app.css','src/config.js','src/data-store.js','src/state-store.js','src/resume-bookmarks.js','src/gesture-controls.js','src/main.js'])if(!fs.existsSync(path.join(appDir,file)))fail(`missing module ${file}`);",
  "for(const file of ['src/app.css','src/config.js','src/data-store.js','src/state-store.js','src/resume-bookmarks.js','src/gesture-controls.js','src/main.js','src/study/study.css','src/study/structure-model.js','src/study/structure-view.js','src/study/dictionary-sheet.js'])if(!fs.existsSync(path.join(appDir,file)))fail(`missing module ${file}`);",
  'assembler required study modules');
write('app/scripts/assemble-production.mjs', assembly);

// -----------------------------------------------------------------------------
// 12) Version/cache contract and offline shell.
// -----------------------------------------------------------------------------
let config = read('app/src/config.js').replace("index-zero-2026-08-26-r7", "index-zero-2026-08-27-r8");
write('app/src/config.js', config);
const version = readJson('app/pwa-version.json');
version.buildId = 'index-zero-2026-08-27-r8';
version.dataVersion = 'canonical-2026-08-27-study-ui-rebuild-v2';
writeJson('app/pwa-version.json', version);
let sw = read('app/sw.js').replace("index-zero-2026-08-26-r7", "index-zero-2026-08-27-r8");
sw = replaceExact(sw,
  "'./','./index.html','./src/app.css','./src/config.js','./src/data-store.js','./src/state-store.js','./src/resume-bookmarks.js','./src/gesture-controls.js','./src/main.js',",
  "'./','./index.html','./src/app.css','./src/config.js','./src/data-store.js','./src/state-store.js','./src/resume-bookmarks.js','./src/gesture-controls.js','./src/main.js','./src/study/study.css','./src/study/structure-model.js','./src/study/structure-view.js','./src/study/dictionary-sheet.js',",
  'service worker study shell');
write('app/sw.js', sw);

// -----------------------------------------------------------------------------
// 13) E2E + static QA rewritten around the new contract.
// -----------------------------------------------------------------------------
let canonicalTest = read('app/tests/canonical_study.e2e.spec.js');
canonicalTest = canonicalTest.replaceAll('.structure-info:not([hidden])', '.syntax-detail:not([hidden])');
write('app/tests/canonical_study.e2e.spec.js', canonicalTest);

write('app/tests/study_rebuild.e2e.spec.js', String.raw`const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:4173/index.html';
async function ready(page){await page.goto(BASE,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.MTS_INDEX_ZERO?.store?.hasCore?.(),null,{timeout:12000});await page.evaluate(()=>Promise.all([MTS_INDEX_ZERO.store.loadStudy(),MTS_INDEX_ZERO.store.loadStructure()]));await page.waitForFunction(()=>MTS_INDEX_ZERO.store.hasStudy()&&MTS_INDEX_ZERO.store.hasStructure(),null,{timeout:15000})}

async function nestedSample(page){return page.evaluate(()=>{for(const scene of ['act1-scene1','act1-scene2','act2'])for(const speech of MTS_INDEX_ZERO.store.getScene(scene)){const structure=MTS_INDEX_ZERO.store.getStructure(speech.id);if(structure?.sentences?.some(s=>s.clauses?.some(c=>c.parentClauseId)&&s.chunks?.some(c=>c.marker==='HV')))return{scene,line:speech.id}}return null})}

test('dictionary uses occurrence meaning and exposes no Pattern or generic play paraphrase',async({page})=>{await ready(page);const audit=await page.evaluate(()=>{let pattern=0,generic=0;for(const entry of Object.values(MTS_INDEX_ZERO.store.dictionary||{})){if('pattern'in entry||'patternDesc'in entry)pattern++;const c=String(entry.contextExplanation||'');if(/^(劇中では|この劇では)/.test(c)||/前後関係からこの意味を取る。?$/.test(c))generic++}return{pattern,generic}});expect(audit).toEqual({pattern:0,generic:0});const sample=await page.evaluate(()=>{for(const scene of ['act1-scene1','act1-scene2','act2'])for(const speech of MTS_INDEX_ZERO.store.getScene(scene)){const v=MTS_INDEX_ZERO.store.getVocabulary(speech.id)[0];if(v)return{scene,line:speech.id,meaning:v.meaning}}return null});expect(sample).toBeTruthy();await page.goto(BASE+'#/line?scene='+sample.scene+'&line='+sample.line);await page.locator('.word-row').first().click();await expect(page.locator('#word-overlay')).toBeVisible();const labels=await page.locator('.word-dict-card dt').allTextContents();expect(labels).not.toContain('Pattern');expect(labels).not.toContain('In this play');await expect(page.locator('.word-dict-card dd').first()).toHaveText(sample.meaning)});

test('Structure is rebuilt from canonical markers with muted span presentation',async({page},testInfo)=>{await ready(page);const sample=await nestedSample(page);expect(sample).toBeTruthy();await page.goto(BASE+'#/line?scene='+sample.scene+'&line='+sample.line);await page.locator('.structure-summary').click();await expect(page.locator('.syntax-view')).toBeVisible();await expect(page.locator('[data-clause-marker]').first()).toBeVisible();await expect(page.locator('[data-syntax-depth="1"]').first()).toBeVisible();await expect(page.locator('[data-marker="HV"]').first()).toBeVisible();await expect(page.locator('[data-marker^="S"]').first()).toBeVisible();await expect(page.locator('.structure-sentence,.structure-clause,.structure-chunk')).toHaveCount(0);const visual=await page.locator('[data-syntax-chunk-id]').first().evaluate(el=>{const text=el.querySelector('.syntax-chunk-text');const s=getComputedStyle(el),t=getComputedStyle(text);return{background:s.backgroundColor,border:s.borderBottomWidth,text:t.color}});expect(visual.background).toBe('rgba(0, 0, 0, 0)');expect(visual.border).toBe('2px');expect(visual.text).toBe('rgb(39, 35, 31)');const first=page.locator('[data-syntax-chunk-id]').first();const marker=await first.getAttribute('data-marker');await first.click();await expect(page.locator('.syntax-detail:not([hidden])').first()).toContainText(marker);await testInfo.attach('structure-approved-visual',{body:await page.screenshot({fullPage:true}),contentType:'image/png'})});

test('fragment analysis remains fragment-first instead of fabricated S/V',async({page})=>{await ready(page);const sample=await page.evaluate(()=>{for(const scene of ['act1-scene1','act1-scene2','act2'])for(const speech of MTS_INDEX_ZERO.store.getScene(scene)){const structure=MTS_INDEX_ZERO.store.getStructure(speech.id);if(structure?.sentences?.some(s=>s.kind==='fragment'&&s.chunks?.length))return{scene,line:speech.id}}return null});expect(sample).toBeTruthy();await page.goto(BASE+'#/line?scene='+sample.scene+'&line='+sample.line);await page.locator('.structure-summary').click();await expect(page.locator('.syntax-fragment').first()).toBeVisible();await expect(page.getByText('undefined',{exact:true})).toHaveCount(0)});

test('expanded Structure wraps on a 360px viewport without horizontal overflow',async({page})=>{await page.setViewportSize({width:360,height:800});await ready(page);const sample=await nestedSample(page);await page.goto(BASE+'#/line?scene='+sample.scene+'&line='+sample.line);await page.locator('.structure-summary').click();const overflow=await page.locator('.syntax-view').evaluate(el=>el.scrollWidth-el.clientWidth);expect(overflow).toBeLessThanOrEqual(1)});
`);

const packageJson = readJson('app/package.json');
if (!packageJson.scripts['test:e2e'].includes('tests/study_rebuild.e2e.spec.js')) packageJson.scripts['test:e2e'] = packageJson.scripts['test:e2e'].replace(' --config=', ' tests/study_rebuild.e2e.spec.js --config=');
writeJson('app/package.json', packageJson);

let staticTest = read('app/tests/index_zero_static.mjs');
staticTest = replaceExact(staticTest,
  "const required=['index.html','src/app.css','src/config.js','src/data-store.js','src/state-store.js','src/resume-bookmarks.js','src/gesture-controls.js','src/main.js','sw.js','playwright.index-zero.config.js','tests/index_zero.e2e.spec.js','tests/resume_bookmarks.e2e.spec.js'];",
  "const required=['index.html','src/app.css','src/config.js','src/data-store.js','src/state-store.js','src/resume-bookmarks.js','src/gesture-controls.js','src/main.js','src/study/study.css','src/study/structure-model.js','src/study/structure-view.js','src/study/dictionary-sheet.js','sw.js','playwright.index-zero.config.js','tests/index_zero.e2e.spec.js','tests/resume_bookmarks.e2e.spec.js','tests/study_rebuild.e2e.spec.js'];",
  'static required files');
staticTest = replaceExact(staticTest,
  "if(main.includes('arrangeLineStudySections')||main.includes('c.role')||main.includes('c.type')||main.includes('S / V / O / C / M'))fail('legacy Structure projection remains');if(!main.includes('structureSentenceModel')||!main.includes('data-clause-marker')||!main.includes('data-marker'))fail('chunking-v1 Structure view model missing');if(!data.includes('validateVocabulary')||!data.includes('playMeaning === true'))fail('Vocabulary presentation contract missing');",
  "const structureModel=read('src/study/structure-model.js'),structureView=read('src/study/structure-view.js'),dictionaryView=read('src/study/dictionary-sheet.js'),studyCss=read('src/study/study.css');if(main.includes('arrangeLineStudySections')||main.includes('c.role')||main.includes('c.type')||main.includes('S / V / O / C / M')||main.includes('structureSentenceModel')||main.includes('structureHtml(')||main.includes('data-structure-info'))fail('legacy Structure implementation remains');if(!main.includes(\"from './study/structure-view.js'\")||!structureModel.includes('buildStructureModel')||!structureView.includes('data-syntax-chunk-id')||!structureView.includes('data-clause-marker'))fail('rebuilt Structure modules missing');if(css.includes('.structure-sentence{')||css.includes('.structure-clause{')||css.includes('.structure-chunk{'))fail('legacy Structure CSS remains');if(!css.startsWith(\"@import url('./study/study.css');\")||!studyCss.includes('.syntax-chunk-text{color:var(--ink)')||!studyCss.includes('background:transparent'))fail('approved Structure visual contract missing');if(dictionaryView.includes('Pattern')||dictionaryView.includes('In this play')||!dictionaryView.includes('vocab?.meaning || entry?.contextMeaning || entry?.coreMeaning'))fail('dictionary presentation contract invalid');if(!data.includes('validateVocabulary')||!data.includes('playMeaning === true')||!data.includes('Pattern fields are forbidden'))fail('Vocabulary/Dictionary contract missing');",
  'static study rebuild assertions');
staticTest = replaceExact(staticTest,
  "if(!sw.includes(\"'./src/resume-bookmarks.js'\"))fail('Resume/Bookmarks runtime is missing from the offline shell cache');",
  "if(!sw.includes(\"'./src/resume-bookmarks.js'\"))fail('Resume/Bookmarks runtime is missing from the offline shell cache');for(const asset of ['./src/study/study.css','./src/study/structure-model.js','./src/study/structure-view.js','./src/study/dictionary-sheet.js'])if(!sw.includes(\"'\"+asset+\"'\"))fail('Study runtime is missing from offline shell: '+asset);",
  'static offline study assets');
write('app/tests/index_zero_static.mjs', staticTest);

// -----------------------------------------------------------------------------
// 14) Permanent CI/Pages checks. The temporary runner is overwritten here.
// -----------------------------------------------------------------------------
write('.github/workflows/app-qa.yml', String.raw`name: App Production QA

on:
  pull_request:
    paths:
      - 'app/**'
      - 'data/**'
      - 'mousetrap_*.json'
      - 'scripts/**'
      - '.github/workflows/app-qa.yml'
  push:
    branches-ignore: ['main']
    paths:
      - 'app/**'
      - 'data/**'
      - 'mousetrap_*.json'
      - 'scripts/**'
      - '.github/workflows/app-qa.yml'

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Validate canonical source data
        run: |
          node scripts/validate-interpretation-scene.mjs act1-scene1
          node scripts/validate-interpretation-scene.mjs act1-scene2
          node scripts/validate-interpretation-scene.mjs act2
          node scripts/validate-interpretation-truth-aware.mjs
          python3 app/scripts/validate-chunking-v1.py --root . --structure app/mousetrap_line_structure.json --report /tmp/chunking-app-qa.json
      - name: Validate runtime and assemble exact artifact
        working-directory: app
        run: |
          node --check src/config.js
          node --check src/data-store.js
          node --check src/main.js
          node --check src/study/structure-model.js
          node --check src/study/structure-view.js
          node --check src/study/dictionary-sheet.js
          node --check sw.js
          node --check scripts/assemble-production.mjs
          node tests/index_zero_static.mjs
          node scripts/assemble-production.mjs --verify-only
          node scripts/assemble-production.mjs --out-dir ../public
          test -e ../public/mousetrap_line_interpretation.json
          test -e ../public/src/study/structure-view.js
          test -e ../public/src/study/dictionary-sheet.js
      - name: Install browser QA
        working-directory: app
        run: |
          npm install
          npx playwright install --with-deps chromium
      - name: Run complete UI regression
        working-directory: app
        run: npm run test:e2e
`);

let pages = read('.github/workflows/pages.yml');
pages = replaceExact(pages,
  "          node --check src/main.js\n          node --check sw.js",
  "          node --check src/main.js\n          node --check src/study/structure-model.js\n          node --check src/study/structure-view.js\n          node --check src/study/dictionary-sheet.js\n          node --check sw.js",
  'Pages syntax checks');
pages = replaceExact(pages,
  "          test -e public/src/main.js\n          test -e public/mousetrap_script_data.json",
  "          test -e public/src/main.js\n          test -e public/src/study/study.css\n          test -e public/src/study/structure-model.js\n          test -e public/src/study/structure-view.js\n          test -e public/src/study/dictionary-sheet.js\n          test -e public/mousetrap_script_data.json",
  'Pages artifact checks');
write('.github/workflows/pages.yml', pages);

// Update the context-expansion workflow so a future rebuild cannot reintroduce the
// old Dictionary or Vocabulary presentation schema.
let expandWorkflow = read('.github/workflows/expand-context-vocabulary.yml');
expandWorkflow = replaceExact(expandWorkflow,
  "              if(!item.surface||!item.lemma||!item.meaning) throw new Error(`blank vocab field ${speechId}`);",
  "              if(!item.surface||!item.lemma||!item.meaning||typeof item.playMeaning!=='boolean') throw new Error(`blank/invalid vocab field ${speechId}`);",
  'expansion workflow playMeaning validation');
expandWorkflow = replaceExact(expandWorkflow,
  "          if(items!==report.vocabulary.afterItems) throw new Error(`item count mismatch ${items}/${report.vocabulary.afterItems}`);",
  "          if(items!==report.vocabulary.afterItems) throw new Error(`item count mismatch ${items}/${report.vocabulary.afterItems}`);\n          for(const [lemma,entry] of Object.entries(dict)){if('pattern'in entry||'patternDesc'in entry)throw new Error(`Pattern field forbidden: ${lemma}`);const c=String(entry.contextExplanation||'');if(/^(劇中では|この劇では)/.test(c)||/前後関係からこの意味を取る。?$/.test(c))throw new Error(`generic context forbidden: ${lemma}`);}",
  'expansion workflow dictionary validation');
write('.github/workflows/expand-context-vocabulary.yml', expandWorkflow);

console.log(JSON.stringify({
  status: 'PASS',
  dictionary: { entries: Object.keys(dictionary).length, sha256: dictionarySha, patternFieldsRemoved, redundantContextRemoved, contextPrefixShortened },
  structurePresentation: 'muted-semantic-span-v1',
  buildId: 'index-zero-2026-08-27-r8'
}, null, 2));
