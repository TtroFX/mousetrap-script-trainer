import fs from 'node:fs';

function replaceExact(path, before, after, label) {
  let text = fs.readFileSync(path, 'utf8');
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`);
  text = text.replace(before, after);
  fs.writeFileSync(path, text);
}

const dataPath = 'app/src/data-store.js';
replaceExact(
  dataPath,
`      const relationByNested = new Map();
      for (const chunk of sentence.chunks) {
        const marker = String(chunk?.marker || '');
        if (chunk.clauseId != null && !clauseIds.has(chunk.clauseId)) throw new Error('structure.' + lineId + ': orphan chunk clause ' + chunk.clauseId);
        if (chunk.nestedClauseId != null && !clauseIds.has(chunk.nestedClauseId)) throw new Error('structure.' + lineId + ': orphan nested clause ' + chunk.nestedClauseId);
        if (!Number.isInteger(chunk.start) || !Number.isInteger(chunk.end) || chunk.start < 0 || chunk.end <= chunk.start || chunk.end > sentenceLength) throw new Error('structure.' + lineId + ': invalid chunk span');
        const role = marker.match(roleMarker);
        if (!role && !allowedUnnumbered.has(marker)) throw new Error('structure.' + lineId + ': unknown marker ' + marker);
        if (/^(Vi|Vt)/.test(marker) || marker.includes('VBN') || /^HV\\d/.test(marker)) throw new Error('structure.' + lineId + ': legacy marker ' + marker);
        if (role) {
          if (!clauseNumbers.has(role[2])) throw new Error('structure.' + lineId + ': role marker without clause ' + marker);
          const owner = clauseById.get(chunk.clauseId);
          if (!owner || String(owner.number) !== role[2]) throw new Error('structure.' + lineId + ': role marker/owner mismatch ' + marker);
        }
        if (chunk.source === 'relation') {
          if (!chunk.nestedClauseId || !/^[SOC]\\d+[a-z]?$/.test(marker)) throw new Error('structure.' + lineId + ': invalid relation chunk');
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
`,
`      for (const chunk of sentence.chunks) {
        const marker = String(chunk?.marker || '');
        if (chunk.clauseId != null && !clauseIds.has(chunk.clauseId)) throw new Error('structure.' + lineId + ': orphan chunk clause ' + chunk.clauseId);
        if (chunk.nestedClauseId != null && !clauseIds.has(chunk.nestedClauseId)) throw new Error('structure.' + lineId + ': orphan nested clause ' + chunk.nestedClauseId);
        if (!Number.isInteger(chunk.start) || !Number.isInteger(chunk.end) || chunk.start < 0 || chunk.end <= chunk.start || chunk.end > sentenceLength) throw new Error('structure.' + lineId + ': invalid chunk span');
        const role = marker.match(roleMarker);
        if (!role && !allowedUnnumbered.has(marker)) throw new Error('structure.' + lineId + ': unknown marker ' + marker);
        if (/^(Vi|Vt)/.test(marker) || marker.includes('VBN') || /^HV\\d/.test(marker)) throw new Error('structure.' + lineId + ': legacy marker ' + marker);
        if (role) {
          if (!clauseNumbers.has(role[2])) throw new Error('structure.' + lineId + ': role marker without clause ' + marker);
          const owner = clauseById.get(chunk.clauseId);
          if (!owner || String(owner.number) !== role[2]) throw new Error('structure.' + lineId + ': role marker/owner mismatch ' + marker);
        }
      }
      for (const clause of sentence.clauses) {
        if (!['S','O','C'].includes(clause.functionInParent) || !clause.parentClauseId) continue;
        const parent = clauseById.get(clause.parentClauseId);
        if (!parent) continue;
        const expectedMarker = clause.functionInParent + String(parent.number);
        const relation = sentence.chunks.find(chunk => String(chunk.marker || '') === expectedMarker && chunk.clauseId === parent.id && chunk.nestedClauseId === clause.id && chunk.start === clause.start && chunk.end === clause.end);
        if (!relation) throw new Error('structure.' + lineId + ': missing outer role relation for ' + clause.marker + ' -> ' + expectedMarker);
      }
`,
  'runtime relation validation'
);

const modelPath = 'app/src/study/structure-model.js';
replaceExact(
  modelPath,
`    const relationByNested = new Map();
    for (const chunk of chunks) if (chunk.source === 'relation' && chunk.nestedClauseId) relationByNested.set(chunk.nestedClauseId, chunk);
`,
`    const relationByNested = new Map();
    for (const clause of clauses) {
      if (!['S', 'O', 'C'].includes(clause.functionInParent) || !clause.parentClauseId) continue;
      const parent = byId.get(clause.parentClauseId);
      if (!parent) continue;
      const expectedMarker = clause.functionInParent + String(parent.number);
      const relation = chunks.find(chunk => String(chunk.marker || '') === expectedMarker && chunk.clauseId === parent.id && chunk.nestedClauseId === clause.id && chunk.start === clause.start && chunk.end === clause.end);
      if (relation) relationByNested.set(clause.id, relation);
    }
    const relationChunkIds = new Set([...relationByNested.values()].map(chunk => chunk.id));
`,
  'model relation derivation'
);
replaceExact(modelPath, ".filter(chunk => chunk.clauseId === clause.id && chunk.source !== 'relation')", ".filter(chunk => chunk.clauseId === clause.id && !relationChunkIds.has(chunk.id))", 'model clause relation suppression');
replaceExact(modelPath, ".filter(chunk => chunk.source !== 'relation' && (!chunk.clauseId || !byId.has(chunk.clauseId)))", ".filter(chunk => !relationChunkIds.has(chunk.id) && (!chunk.clauseId || !byId.has(chunk.clauseId)))", 'model loose relation suppression');

const staticPath = 'app/tests/index_zero_static.mjs';
let staticText = fs.readFileSync(staticPath, 'utf8');
const needle = "if(!main.includes(\"from './study/structure-view.js'\")||!structureModel.includes('buildStructureModel')||!structureView.includes('data-syntax-chunk-id')||!structureView.includes('data-clause-marker'))fail('rebuilt Structure modules missing');";
if (!staticText.includes(needle)) throw new Error('static structure assertion anchor missing');
staticText = staticText.replace(needle, needle + "if(data.includes(\"chunk.source === 'relation'\")||structureModel.includes(\"chunk.source === 'relation'\"))fail('Structure relation semantics must not depend on non-canonical source metadata');");
fs.writeFileSync(staticPath, staticText);

for (const path of [dataPath, modelPath]) {
  const text = fs.readFileSync(path, 'utf8');
  if (text.includes("chunk.source === 'relation'")) throw new Error(`non-canonical source dependency remains in ${path}`);
}
console.log('Canonical relation semantics aligned with validate-chunking-v1.py.');
