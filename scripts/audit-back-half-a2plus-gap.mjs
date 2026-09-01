import fs from 'node:fs';
import crypto from 'node:crypto';

const read = p => fs.readFileSync(p,'utf8');
const json = p => JSON.parse(read(p));
const norm = v => String(v||'').normalize('NFKC').toLowerCase().replace(/[‘’]/g,"'").trim();
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const sourcePath='data/a2plus-candidate-lists/part-03-04-unique.txt';
const dictionaryPath='mousetrap_word_dictionary.json';
const outPath='data/a2plus-back-half-integration/gap-audit.json';
const source=read(sourcePath).split(/\r?\n/);
const headerIndex=source.findIndex(line=>line.startsWith('word\tcefr\tparts\toccurrences\tfirstSpeechId\tsurfaceForms\tallOxfordLevels'));
if(headerIndex<0) throw new Error('candidate TSV header not found');
const rows=source.slice(headerIndex+1).filter(Boolean).map(line=>{
  const [word,cefr,parts,occurrences,firstSpeechId,surfaceForms,allOxfordLevels]=line.split('\t');
  return {word,cefr,parts,occurrences:Number(occurrences),firstSpeechId,surfaceForms,allOxfordLevels};
});
if(rows.length!==250) throw new Error(`expected 250 candidates, got ${rows.length}`);
const dictionary=json(dictionaryPath);
const dictNorm=new Map(Object.keys(dictionary).map(k=>[norm(k),k]));
const present=[];
const unresolved=[];
for(const row of rows){
  const existing=dictNorm.get(norm(row.word));
  const item={...row,mixedA1:String(row.allOxfordLevels||'').split('/').includes('A1')};
  if(existing) present.push({...item,existingLemma:existing});
  else unresolved.push(item);
}
const report={
  schemaVersion:1,
  scope:{globalSpeechRange:[583,1164],speechCount:582,first:'act2-speech-0057',last:'act2-speech-0638'},
  source:{path:sourcePath,sha256:sha256(sourcePath),candidateCount:rows.length},
  dictionary:{path:dictionaryPath,sha256:sha256(dictionaryPath),entries:Object.keys(dictionary).length},
  counts:{candidateCount:rows.length,alreadyPresent:present.length,unresolved:unresolved.length,unresolvedPureA2Plus:unresolved.filter(x=>!x.mixedA1).length,unresolvedMixedA1:unresolved.filter(x=>x.mixedA1).length},
  alreadyPresent:present,
  unresolved
};
fs.mkdirSync('data/a2plus-back-half-integration',{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.counts));
