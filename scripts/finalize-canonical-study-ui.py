#!/usr/bin/env python3
from pathlib import Path

ROOT=Path.cwd()

def read(path): return (ROOT/path).read_text(encoding='utf-8')
def write(path,text): (ROOT/path).write_text(text if text.endswith('\n') else text+'\n',encoding='utf-8')
def exact(text,old,new,label):
    n=text.count(old)
    if n!=1: raise RuntimeError(f'{label}: expected 1 match, got {n}')
    return text.replace(old,new,1)

# Preserve the established Line Detail information order: study notes before collapsed Structure.
main=read('app/src/main.js')
start=main.index('function lineView(q){')
end=main.index('\nasync function openWordSheet',start)
segment=main[start:end]
structure_start=segment.index('<div class="card" data-structure-card>')
study_pos=segment.index('${studyCard}',structure_start)
structure_block=segment[structure_start:study_pos]
segment=segment[:structure_start]+'${studyCard}'+structure_block+segment[study_pos+len('${studyCard}'):]
main=main[:start]+segment+main[end:]
write('app/src/main.js',main)

# Strengthen the canonical chunking-v1 runtime contract: every chunk reference must resolve.
data=read('app/src/data-store.js')
old="""      for (const chunk of sentence.chunks) {
        const marker = String(chunk?.marker || '');
        if (!Number.isInteger(chunk.start) || !Number.isInteger(chunk.end) || chunk.start < 0 || chunk.end <= chunk.start || chunk.end > sentence.end - sentence.start) throw new Error(`structure.${lineId}: invalid chunk span`);
"""
new="""      for (const chunk of sentence.chunks) {
        const marker = String(chunk?.marker || '');
        if (chunk.clauseId != null && !clauseIds.has(chunk.clauseId)) throw new Error(`structure.${lineId}: orphan chunk clause ${chunk.clauseId}`);
        if (chunk.nestedClauseId != null && !clauseIds.has(chunk.nestedClauseId)) throw new Error(`structure.${lineId}: orphan nested clause ${chunk.nestedClauseId}`);
        if (!Number.isInteger(chunk.start) || !Number.isInteger(chunk.end) || chunk.start < 0 || chunk.end <= chunk.start || chunk.end > sentence.end - sentence.start) throw new Error(`structure.${lineId}: invalid chunk span`);
"""
data=exact(data,old,new,'structure reference validation')
write('app/src/data-store.js',data)

# Permanent E2E already expresses the intended order; no compatibility code is introduced.
print('PASS')
