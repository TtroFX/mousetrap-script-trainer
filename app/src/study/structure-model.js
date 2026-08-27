const CLAUSE_LABELS = Object.freeze({
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
    for (const clause of clauses) {
      if (!['S', 'O', 'C'].includes(clause.functionInParent) || !clause.parentClauseId) continue;
      const parent = byId.get(clause.parentClauseId);
      if (!parent) continue;
      const expectedMarker = clause.functionInParent + String(parent.number);
      const relation = chunks.find(chunk => String(chunk.marker || '') === expectedMarker && chunk.clauseId === parent.id && chunk.nestedClauseId === clause.id && chunk.start === clause.start && chunk.end === clause.end);
      if (relation) relationByNested.set(clause.id, relation);
    }
    const relationChunkIds = new Set([...relationByNested.values()].map(chunk => chunk.id));

    const clauseModels = clauses.map(clause => {
      const relation = relationByNested.get(clause.id) || null;
      const ownChunks = chunks
        .filter(chunk => chunk.clauseId === clause.id && !relationChunkIds.has(chunk.id))
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
      .filter(chunk => !relationChunkIds.has(chunk.id) && (!chunk.clauseId || !byId.has(chunk.clauseId)))
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
