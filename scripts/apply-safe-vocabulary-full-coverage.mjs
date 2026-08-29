import fs from 'node:fs';
import crypto from 'node:crypto';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p,v) => fs.writeFileSync(p, JSON.stringify(v,null,2)+'\n');
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const norm = v => String(v ?? '').normalize('NFKC').replace(/[’‘]/g,"'").trim();
const key = v => norm(v).toLowerCase();

const AUDIT='data/vocabulary-full-coverage-audit.json';
const VOCAB='mousetrap_line_vocabulary.json';
const DICT='mousetrap_word_dictionary.json';
const CONTRACT='data/canonical-production-contract.json';
const MANIFEST='data/canonical-integration-manifest.json';
const REPORT='data/vocabulary-full-coverage-safe-repair.json';
const SAFE=new Set(['ADD_EXISTING_SURFACE','ADD_EXACT_DICTIONARY','ADD_MORPHOLOGY']);

const audit=read(AUDIT), vocab=read(VOCAB), dict=read(DICT);
const dictKey=new Map(Object.keys(dict).map(k=>[key(k),k]));
let candidates=0, added=0, alreadyPresent=0, collapsedDuplicates=0;
const byKind={};
const seenCandidate=new Set();
for(const c of audit.candidates||[]){
  if(!SAFE.has(c.kind)) continue;
  candidates++; byKind[c.kind]=(byKind[c.kind]||0)+1;
  const speechId=c.speechId, lemmaKey=dictKey.get(key(c.lemma));
  if(!lemmaKey) throw new Error(`dictionary missing for safe candidate ${speechId} ${c.lemma}`);
  const entry=dict[lemmaKey];
  if(Array.isArray(entry.tags)&&entry.tags.includes('polysemy')) throw new Error(`polysemy leaked into safe class ${speechId} ${lemmaKey}`);
  const id=`${speechId}\u0000${key(c.surface)}\u0000${key(lemmaKey)}`;
  if(seenCandidate.has(id)){collapsedDuplicates++;continue;} seenCandidate.add(id);
  const rows=Array.isArray(vocab[speechId])?vocab[speechId]:(vocab[speechId]=[]);
  if(rows.some(x=>key(x.surface)===key(c.surface)&&key(x.lemma)===key(lemmaKey))){alreadyPresent++;continue;}
  rows.push({surface:norm(c.surface),lemma:lemmaKey,meaning:entry.meaning,playMeaning:false});
  added++;
}

// Assert no duplicate surface+lemma pair within any speech after additions.
for(const [speechId,rows] of Object.entries(vocab)){
  const seen=new Set();
  for(const item of rows||[]){
    const k=`${key(item.surface)}\u0000${key(item.lemma)}`;
    if(seen.has(k)) throw new Error(`duplicate pair after safe repair ${speechId}: ${item.surface} -> ${item.lemma}`);
    seen.add(k);
  }
}
write(VOCAB,vocab);
const vocabSha=sha256(VOCAB);
const contract=read(CONTRACT);
for(const f of contract.files||[]) if(f.path===VOCAB) f.sha256=vocabSha;
write(CONTRACT,contract);
const manifest=read(MANIFEST);
if(manifest.studyAssets?.lineVocabulary){
  manifest.studyAssets.lineVocabulary.sha256=vocabSha;
  manifest.studyAssets.lineVocabulary.items=Object.values(vocab).reduce((n,r)=>n+(Array.isArray(r)?r.length:0),0);
  manifest.studyAssets.lineVocabulary.annotatedSpeeches=Object.values(vocab).filter(r=>Array.isArray(r)&&r.length).length;
}
write(MANIFEST,manifest);
const report={schemaVersion:1,status:'APPLIED',safeKinds:[...SAFE],candidateOccurrences:candidates,addedVocabularyItems:added,alreadyPresent,collapsedDuplicates,byKind,finalVocabularyItems:Object.values(vocab).reduce((n,r)=>n+(Array.isArray(r)?r.length:0),0),finalAnnotatedSpeeches:Object.values(vocab).filter(r=>Array.isArray(r)&&r.length).length,sha256:{vocabulary:vocabSha}};
write(REPORT,report);
console.log(JSON.stringify(report,null,2));
