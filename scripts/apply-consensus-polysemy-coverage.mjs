import fs from 'node:fs';
import crypto from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const norm=v=>String(v??'').normalize('NFKC').replace(/[’‘]/g,"'").trim();
const key=v=>norm(v).toLowerCase();
const VOCAB='mousetrap_line_vocabulary.json', DICT='mousetrap_word_dictionary.json', AUDIT='data/vocabulary-full-coverage-audit.json';
const vocab=read(VOCAB),dict=read(DICT),audit=read(AUDIT);
const dictKey=new Map(Object.keys(dict).map(k=>[key(k),k]));
const consensus=new Map();
for(const rows of Object.values(vocab)) for(const item of rows||[]){
  const ctx=norm(item.inThisPlay); if(!ctx)continue;
  const k=`${key(item.surface)}\u0000${key(item.lemma)}`;
  if(!consensus.has(k))consensus.set(k,new Set()); consensus.get(k).add(ctx);
}
let candidates=0,added=0,noConsensus=0,ambiguousConsensus=0,duplicates=0;
const addedByLemma={};
for(const c of audit.candidates||[]){
  if(!String(c.kind).startsWith('REVIEW_POLYSEMY_'))continue;
  candidates++;
  const dk=dictKey.get(key(c.lemma)); if(!dk)throw new Error(`dictionary missing ${c.lemma}`);
  const entry=dict[dk]; if(!(Array.isArray(entry.tags)&&entry.tags.includes('polysemy')))throw new Error(`not tagged polysemy ${dk}`);
  const contexts=consensus.get(`${key(c.surface)}\u0000${key(dk)}`);
  if(!contexts||contexts.size===0){noConsensus++;continue;}
  if(contexts.size!==1){ambiguousConsensus++;continue;}
  const ctx=[...contexts][0];
  const rows=Array.isArray(vocab[c.speechId])?vocab[c.speechId]:(vocab[c.speechId]=[]);
  if(rows.some(x=>key(x.surface)===key(c.surface)&&key(x.lemma)===key(dk))){duplicates++;continue;}
  rows.push({surface:norm(c.surface),lemma:dk,meaning:entry.meaning,playMeaning:true,inThisPlay:ctx});
  added++; addedByLemma[dk]=(addedByLemma[dk]||0)+1;
}
write(VOCAB,vocab);
const vocabSha=sha(VOCAB);
const contract=read('data/canonical-production-contract.json');for(const f of contract.files||[])if(f.path===VOCAB)f.sha256=vocabSha;write('data/canonical-production-contract.json',contract);
const manifest=read('data/canonical-integration-manifest.json');if(manifest.studyAssets?.lineVocabulary){manifest.studyAssets.lineVocabulary.sha256=vocabSha;manifest.studyAssets.lineVocabulary.items=Object.values(vocab).reduce((n,r)=>n+(r?.length||0),0);manifest.studyAssets.lineVocabulary.annotatedSpeeches=Object.values(vocab).filter(r=>r?.length).length;}write('data/canonical-integration-manifest.json',manifest);
const report={schemaVersion:1,status:'APPLIED',candidateOccurrences:candidates,addedVocabularyItems:added,noConsensus,ambiguousConsensus,duplicates,addedByLemma,finalVocabularyItems:Object.values(vocab).reduce((n,r)=>n+(r?.length||0),0),sha256:{vocabulary:vocabSha}};write('data/vocabulary-full-coverage-polysemy-consensus-repair.json',report);console.log(JSON.stringify(report,null,2));
