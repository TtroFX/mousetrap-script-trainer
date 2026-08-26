import { buildStructureModel, markerBase, markerLabel } from './structure-model.js';

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
