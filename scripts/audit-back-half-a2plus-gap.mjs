import fs from 'node:fs';
import crypto from 'node:crypto';

const read = p => fs.readFileSync(p,'utf8');
const json = p => JSON.parse(read(p));
const norm = v => String(v||'').normalize('NFKC').toLowerCase().replace(/[‘’]/g,"'").replace(/\s+/g,' ').trim();
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const hasToken = (haystack,needle) => new RegExp(`(^|[^a-z])${esc(norm(needle))}(?=$|[^a-z])`,'i').test(norm(haystack));

const sourcePath='data/a2plus-candidate-lists/part-03-04-unique.txt';
const dictionaryPath='mousetrap_word_dictionary.json';
const vocabularyPath='mousetrap_line_vocabulary.json';
const scriptPath='mousetrap_script_data.json';
const outDir='data/a2plus-back-half-integration';
const outPath=`${outDir}/gap-audit.json`;
const source=read(sourcePath).split(/\r?\n/);
const headerIndex=source.findIndex(line=>line.startsWith('word\tcefr\tparts\toccurrences\tfirstSpeechId\tsurfaceForms\tallOxfordLevels'));
if(headerIndex<0) throw new Error('candidate TSV header not found');
const rows=source.slice(headerIndex+1).filter(Boolean).map(line=>{
  const [word,cefr,parts,occurrences,firstSpeechId,surfaceForms,allOxfordLevels]=line.split('\t');
  return {word,cefr,parts,occurrences:Number(occurrences),firstSpeechId,surfaceForms,allOxfordLevels};
});
if(rows.length!==250) throw new Error(`expected 250 candidates, got ${rows.length}`);
const dictionary=json(dictionaryPath);
const vocabulary=json(vocabularyPath);
const dictNorm=new Map(Object.keys(dictionary).map(k=>[norm(k),k]));
const script=json(scriptPath);
const target=(script.act2?.speeches||[]).slice(56,638);
if(target.length!==582 || target[0]?.id!=='act2-speech-0057' || target.at(-1)?.id!=='act2-speech-0638') throw new Error('back-half speech boundary mismatch');
const present=[];
const unresolved=[];
for(const row of rows){
  const existing=dictNorm.get(norm(row.word));
  const forms=String(row.surfaceForms||'').split(',').map(x=>x.trim()).filter(Boolean);
  const contexts=[];
  const coveringLemmas=new Set();
  for(const speech of target){
    const matched=forms.filter(form=>new RegExp(`(^|[^A-Za-z])${esc(form)}(?=$|[^A-Za-z])`,'i').test(String(speech.text||'')));
    if(!matched.length) continue;
    const covering=(vocabulary[speech.id]||[]).filter(item=>{
      const surface=String(item?.surface||'');
      return matched.some(form=>norm(surface)!==norm(form) && hasToken(surface,form));
    }).map(item=>String(item.lemma||'')).filter(Boolean);
    covering.forEach(x=>coveringLemmas.add(x));
    contexts.push({speechId:speech.id,speaker:speech.speaker,matchedForms:matched,coveringLemmas:[...new Set(covering)],text:speech.text});
  }
  const uncoveredSpeechCount=contexts.filter(x=>x.coveringLemmas.length===0).length;
  const coveredSpeechCount=contexts.length-uncoveredSpeechCount;
  const item={...row,mixedA1:String(row.allOxfordLevels||'').split('/').includes('A1'),coveringLemmas:[...coveringLemmas].sort(),matchedSpeechCount:contexts.length,uncoveredSpeechCount,coveredSpeechCount,contexts};
  if(existing) present.push({...item,existingLemma:existing});
  else unresolved.push(item);
}
const report={
  schemaVersion:1,
  scope:{globalSpeechRange:[583,1164],speechCount:582,first:'act2-speech-0057',last:'act2-speech-0638'},
  source:{path:sourcePath,sha256:sha256(sourcePath),candidateCount:rows.length},
  dictionary:{path:dictionaryPath,sha256:sha256(dictionaryPath),entries:Object.keys(dictionary).length},
  counts:{candidateCount:rows.length,alreadyPresent:present.length,unresolved:unresolved.length,unresolvedPureA2Plus:unresolved.filter(x=>!x.mixedA1).length,unresolvedMixedA1:unresolved.filter(x=>x.mixedA1).length},
  alreadyPresent:present.map(({contexts,...x})=>x),
  unresolved:unresolved.map(({contexts,...x})=>x)
};
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(report,null,2)+'\n');
const groups=[['a-d', /^[a-d]/i],['e-h', /^[e-h]/i],['i-m', /^[i-m]/i],['n-r', /^[n-r]/i],['s-t', /^[s-t]/i],['u-z', /^[u-z]/i]];
for(const [name,re] of groups){
  const items=unresolved.filter(x=>re.test(x.word));
  fs.writeFileSync(`${outDir}/review-${name}.json`,JSON.stringify({schemaVersion:1,group:name,count:items.length,items},null,2)+'\n');
  const compact=['word\tcefr\tallOxfordLevels\tsurfaceForms\tmatchedSpeeches\tuncoveredSpeeches\tcoveringLemmas\tfirstSpeechId\tfirstContext'];
  for(const item of items){
    const first=item.contexts[0];
    const text=String(first?.text||'').replace(/\s+/g,' ').replace(/\t/g,' ').slice(0,210);
    compact.push([item.word,item.cefr,item.allOxfordLevels,item.surfaceForms,item.matchedSpeechCount,item.uncoveredSpeechCount,item.coveringLemmas.join(' | '),item.firstSpeechId,text].join('\t'));
  }
  fs.writeFileSync(`${outDir}/compact-${name}.tsv`,compact.join('\n')+'\n');
}
console.log(JSON.stringify(report.counts));
