import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT=process.cwd();
const abs=p=>path.join(ROOT,p);
const readJson=p=>JSON.parse(fs.readFileSync(abs(p),'utf8'));
const writeJson=(p,v)=>fs.writeFileSync(abs(p),JSON.stringify(v,null,2)+'\n');
const sha256=p=>crypto.createHash('sha256').update(fs.readFileSync(abs(p))).digest('hex');
const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[‘’]/g,"'").replace(/\s+/g,' ').trim();
const dictKey=s=>String(s??'').trim().toLowerCase();
const fail=msg=>{throw new Error(msg);};
const escapeRe=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const hasToken=(haystack,needle)=>new RegExp(`(^|[^a-z])${escapeRe(norm(needle))}(?=$|[^a-z])`,'i').test(norm(haystack));

const FILES={
  script:'mousetrap_script_data.json', vocabulary:'mousetrap_line_vocabulary.json', dictionary:'mousetrap_word_dictionary.json',
  translations:'mousetrap_line_translations.json', grammar:'mousetrap_line_grammar.json',
  contract:'data/canonical-production-contract.json', manifest:'data/canonical-integration-manifest.json',
  candidate:'data/a2plus-candidate-lists/part-03-04-unique.txt', policy:'data/a2plus-back-half-integration/review-policy.json',
  report:'data/a2plus-back-half-integration/integration-qa.json'
};
const definitionFiles=[1,2,3].map(n=>`data/a2plus-back-half-integration/definitions-0${n}.json`);

const script=readJson(FILES.script);
const vocabulary=readJson(FILES.vocabulary);
let dictionary=readJson(FILES.dictionary);
const policy=readJson(FILES.policy);
const definitions={};
for(const p of definitionFiles){
  for(const [lemma,spec] of Object.entries(readJson(p))){
    if(definitions[lemma]) fail(`Duplicate definition ${lemma}`);
    definitions[lemma]=spec;
  }
}

const allSpeeches=[...script['act1-scene1'].speeches,...script['act1-scene2'].speeches,...script.act2.speeches];
if(allSpeeches.length!==1164) fail(`Expected 1164 speeches, got ${allSpeeches.length}`);
const targetSpeeches=allSpeeches.slice(582);
if(targetSpeeches.length!==582||targetSpeeches[0]?.id!=='act2-speech-0057'||targetSpeeches.at(-1)?.id!=='act2-speech-0638'||allSpeeches[581]?.id!=='act2-speech-0056') fail('Back-half boundary mismatch');
const targetIds=new Set(targetSpeeches.map(s=>s.id));
const bySpeech=new Map(targetSpeeches.map(s=>[s.id,s]));

const candidateLines=fs.readFileSync(abs(FILES.candidate),'utf8').split(/\r?\n/);
const hi=candidateLines.findIndex(x=>x.startsWith('word\tcefr\tparts\t'));
if(hi<0) fail('Candidate header missing');
const candidateRows=candidateLines.slice(hi+1).filter(Boolean).map(line=>{
  const [word,cefr,parts,occurrences,firstSpeechId,surfaceForms,allOxfordLevels]=line.split('\t');
  return {word:norm(word),cefr,parts,occurrences:Number(occurrences),firstSpeechId,surfaceForms,allOxfordLevels};
});
if(candidateRows.length!==250) fail(`Expected 250 candidate rows, got ${candidateRows.length}`);
const candidateByWord=new Map(candidateRows.map(r=>[r.word,r]));

const selected=[...new Set((policy.selectedCandidateLemmas||[]).map(norm))];
if(selected.length!==43) fail(`Expected 43 selected candidate lemmas, got ${selected.length}`);
for(const lemma of selected) if(!candidateByWord.has(lemma)) fail(`Selected lemma missing candidate row: ${lemma}`);
const custom=Array.isArray(policy.customPhraseAdditions)?policy.customPhraseAdditions:[];
if(custom.length!==5) fail(`Expected 5 custom phrase additions, got ${custom.length}`);
const expectedDefinitionKeys=new Set([...selected,...custom.map(x=>norm(x.lemma))]);
const definitionKeys=new Set(Object.keys(definitions).map(norm));
const missingDefs=[...expectedDefinitionKeys].filter(x=>!definitionKeys.has(x));
const extraDefs=[...definitionKeys].filter(x=>!expectedDefinitionKeys.has(x));
if(missingDefs.length||extraDefs.length) fail(`Definition reconciliation failed missing=${missingDefs.join(',')} extra=${extraDefs.join(',')}`);
if(expectedDefinitionKeys.size!==48) fail(`Expected 48 integrated lemmas, got ${expectedDefinitionKeys.size}`);

const protectedHashes={script:sha256(FILES.script),translations:sha256(FILES.translations),grammar:sha256(FILES.grammar)};
const before={
  dictionaryEntries:Object.keys(dictionary).length,
  allVocabularyItems:Object.values(vocabulary).reduce((n,rows)=>n+(Array.isArray(rows)?rows.length:0),0),
  targetVocabularyItems:targetSpeeches.reduce((n,s)=>n+(vocabulary[s.id]||[]).length,0)
};
const outOfScopeSnapshot=new Map(allSpeeches.slice(0,582).map(s=>[s.id,JSON.stringify(vocabulary[s.id]||[])]));

const dictionaryByNorm=new Map(Object.keys(dictionary).map(k=>[norm(k),k]));
let newDictionaryEntries=0;
for(const lemma of [...expectedDefinitionKeys].sort()){
  if(dictionaryByNorm.has(lemma)) continue;
  const sourceKey=Object.keys(definitions).find(k=>norm(k)===lemma);
  const spec=definitions[sourceKey];
  const meaning=String(spec?.meaning||'').trim();
  const pos=String(spec?.pos||'').trim();
  if(!meaning||!pos) fail(`Invalid definition ${lemma}`);
  if(!lemma.includes(' ')&&!meaning.startsWith('【')) fail(`Single-word definition lacks POS heading ${lemma}`);
  const key=sourceKey;
  dictionary[key]={lemma:key,pos,coreMeaning:meaning,tags:Array.isArray(spec.tags)?[...new Set(spec.tags.map(String))]:[],meaning};
  dictionaryByNorm.set(lemma,key);
  newDictionaryEntries++;
}
dictionary=Object.fromEntries(Object.entries(dictionary).sort(([a],[b])=>norm(a).localeCompare(norm(b),'en')));

function findSurface(text,surface){
  const raw=String(text??'').replace(/[‘’]/g,"'");
  const wanted=String(surface??'').replace(/[‘’]/g,"'").trim();
  if(!wanted)return null;
  const m=raw.match(new RegExp(`(^|[^A-Za-z])(${escapeRe(wanted)})(?=$|[^A-Za-z])`,'i'));
  return m?m[2]:null;
}
function candidateSurfaces(lemma){
  return [...new Set(String(candidateByWord.get(lemma)?.surfaceForms||'').split(',').map(x=>x.trim()).filter(Boolean))];
}
function dictionaryEntry(lemma){
  const key=dictionaryByNorm.get(norm(lemma));
  return key?{key,entry:dictionary[key]}:null;
}
function coveredByExisting(rows,actual,targetLemma){
  const exact=rows.find(item=>norm(item?.surface)===norm(actual));
  if(exact) return {type:'exact',lemma:String(exact.lemma||'')};
  const phrase=rows.find(item=>norm(item?.surface)!==norm(actual)&&hasToken(item?.surface,actual));
  if(phrase) return {type:'phrase',lemma:String(phrase.lemma||'')};
  return null;
}

let newVocabularyItems=0,alreadyPresent=0,exactCovered=0,phraseCovered=0,inThisPlayAdded=0,matchedSpeechSurfaces=0;
const selectedDetails=[];
for(const lemma of [...selected].sort()){
  const de=dictionaryEntry(lemma); if(!de) fail(`Dictionary entry missing after integration: ${lemma}`);
  const surfaces=candidateSurfaces(lemma); if(!surfaces.length) fail(`No surfaces for ${lemma}`);
  const allowedIds=policy.mixedA1CandidateExceptions?.[lemma]?.speechIds;
  const allowed=Array.isArray(allowedIds)&&allowedIds.length?new Set(allowedIds):null;
  if(allowed&&[...allowed].some(id=>!targetIds.has(id))) fail(`Allowed speech escapes target ${lemma}`);
  let matches=0,adds=0,exactSkips=0,phraseSkips=0;
  for(const surface of surfaces){
    for(const speech of targetSpeeches){
      if(allowed&&!allowed.has(speech.id)) continue;
      const actual=findSurface(speech.text,surface); if(!actual) continue;
      matches++; matchedSpeechSurfaces++;
      if(!Array.isArray(vocabulary[speech.id])) vocabulary[speech.id]=[];
      const rows=vocabulary[speech.id];
      const samePair=rows.find(x=>norm(x.surface)===norm(actual)&&norm(x.lemma)===lemma);
      if(samePair){alreadyPresent++;continue;}
      const coverage=coveredByExisting(rows,actual,lemma);
      if(coverage){
        if(coverage.type==='exact'){exactCovered++;exactSkips++;}else{phraseCovered++;phraseSkips++;}
        continue;
      }
      const item={surface:actual,lemma:de.key,meaning:String(de.entry.meaning).trim(),playMeaning:false};
      const context=String(policy.contextOverrides?.[lemma]||'').trim();
      if(context){item.inThisPlay=context;item.playMeaning=true;inThisPlayAdded++;}
      rows.push(item); adds++; newVocabularyItems++;
    }
  }
  if(!matches) fail(`Selected lemma has no back-half source match ${lemma}`);
  if(adds===0) fail(`Selected lemma produced no uncovered addition ${lemma}`);
  selectedDetails.push({lemma,surfaces,matchedSpeechSurfaces:matches,newVocabularyItems:adds,exactCovered:exactSkips,phraseCovered:phraseSkips});
}

const customDetails=[];
for(const rule of custom){
  const speech=bySpeech.get(rule.speechId); if(!speech) fail(`Custom phrase speech out of scope ${rule.speechId}`);
  const actual=findSurface(speech.text,rule.surface); if(!actual) fail(`Custom phrase not found ${rule.speechId}/${rule.surface}`);
  const de=dictionaryEntry(rule.lemma); if(!de) fail(`Custom phrase dictionary missing ${rule.lemma}`);
  const rows=vocabulary[speech.id]||[];
  const samePair=rows.find(x=>norm(x.surface)===norm(actual)&&norm(x.lemma)===norm(rule.lemma));
  if(samePair){alreadyPresent++;customDetails.push({speechId:speech.id,surface:actual,lemma:rule.lemma,status:'already-present'});continue;}
  const sameSurface=rows.find(x=>norm(x.surface)===norm(actual));
  if(sameSurface) fail(`Custom phrase surface already maps to another lemma ${speech.id}/${actual}/${sameSurface.lemma}`);
  const item={surface:actual,lemma:de.key,meaning:String(de.entry.meaning).trim(),playMeaning:false};
  const context=String(rule.inThisPlay||'').trim();
  if(context){item.inThisPlay=context;item.playMeaning=true;inThisPlayAdded++;}
  rows.push(item); vocabulary[speech.id]=rows; newVocabularyItems++;
  customDetails.push({speechId:speech.id,surface:actual,lemma:rule.lemma,status:'added'});
}

for(const speech of targetSpeeches){
  const rows=vocabulary[speech.id]||[];
  const text=norm(speech.text);
  rows.forEach((row,i)=>{row.__i=i;});
  rows.sort((a,b)=>{
    const ai=text.indexOf(norm(a.surface)),bi=text.indexOf(norm(b.surface));
    const av=ai<0?Number.MAX_SAFE_INTEGER:ai,bv=bi<0?Number.MAX_SAFE_INTEGER:bi;
    return av-bv||a.__i-b.__i;
  });
  rows.forEach(row=>delete row.__i);
}
for(const [id,snapshot] of outOfScopeSnapshot) if(JSON.stringify(vocabulary[id]||[])!==snapshot) fail(`Front-half vocabulary changed ${id}`);

writeJson(FILES.dictionary,dictionary);
writeJson(FILES.vocabulary,vocabulary);

const exactDict=new Map(Object.entries(dictionary).map(([k,v])=>[dictKey(k),v]));
let vocabItems=0,annotatedSpeeches=0,playMeaningItems=0,neutralOnlyItems=0,inThisPlayItems=0;
const referenced=new Set();
for(const speech of allSpeeches){
  const rows=vocabulary[speech.id]||[]; if(rows.length) annotatedSpeeches++;
  const seen=new Set(),surfaceMap=new Map();
  for(const item of rows){
    const surface=String(item?.surface||'').trim(),lemma=String(item?.lemma||'').trim(),meaning=String(item?.meaning||'').trim();
    if(!surface||!lemma||!meaning||typeof item.playMeaning!=='boolean') fail(`Invalid vocab row ${speech.id}`);
    const pair=`${norm(surface)}\0${norm(lemma)}`; if(seen.has(pair)) fail(`Duplicate vocab pair ${speech.id}/${surface}/${lemma}`); seen.add(pair);
    const surfaceKey=norm(surface); const prior=surfaceMap.get(surfaceKey); if(prior&&norm(prior)!==norm(lemma)) fail(`Surface maps to multiple lemmas ${speech.id}/${surface}: ${prior}, ${lemma}`); surfaceMap.set(surfaceKey,lemma);
    const de=exactDict.get(dictKey(lemma)); if(!de) fail(`Missing dictionary ref ${speech.id}/${lemma}`);
    if(String(de.meaning||'').trim()!==meaning) fail(`Meaning mismatch ${speech.id}/${lemma}`);
    if('inThisPlay' in item){const t=String(item.inThisPlay||'').trim();if(!t||t===meaning||t.length>360)fail(`Invalid inThisPlay ${speech.id}/${lemma}`);inThisPlayItems++;}
    referenced.add(norm(lemma));vocabItems++;item.playMeaning?playMeaningItems++:neutralOnlyItems++;
  }
}
for(const [key,entry] of Object.entries(dictionary)){
  if(!entry||typeof entry!=='object'||!String(entry.pos||'').trim()) fail(`Invalid dictionary ${key}`);
  const meaning=String(entry.meaning||'').trim(),core=String(entry.coreMeaning||'').trim();
  if(!meaning||meaning!==core) fail(`Dictionary meaning/core mismatch ${key}`);
  if('contextMeaning' in entry||'contextExplanation' in entry||'pattern' in entry||'patternDesc' in entry) fail(`Context/pattern leaked to dictionary ${key}`);
}
const afterTarget=targetSpeeches.reduce((n,s)=>n+(vocabulary[s.id]||[]).length,0);
if(vocabItems-before.allVocabularyItems!==newVocabularyItems) fail('Whole-play vocabulary delta mismatch');
if(afterTarget-before.targetVocabularyItems!==newVocabularyItems) fail('Back-half vocabulary delta mismatch');
if(Object.keys(dictionary).length-before.dictionaryEntries!==newDictionaryEntries) fail('Dictionary delta mismatch');
const afterProtected={script:sha256(FILES.script),translations:sha256(FILES.translations),grammar:sha256(FILES.grammar)};
if(JSON.stringify(protectedHashes)!==JSON.stringify(afterProtected)) fail('Protected canonical source changed');

const contract=readJson(FILES.contract); const contractByPath=new Map(contract.files.map(x=>[x.path,x]));
for(const p of [FILES.script,FILES.translations,FILES.vocabulary,FILES.grammar,FILES.dictionary]){const item=contractByPath.get(p);if(!item)fail(`Canonical contract missing ${p}`);item.sha256=sha256(p);}
writeJson(FILES.contract,contract);
const manifest=readJson(FILES.manifest);
if(manifest.studyAssets?.lineVocabulary)Object.assign(manifest.studyAssets.lineVocabulary,{sha256:sha256(FILES.vocabulary),coverageSpeechIds:1164,items:vocabItems,annotatedSpeeches,playMeaningItems,neutralOnlyItems,inThisPlayItems});
if(manifest.studyAssets?.wordDictionary)Object.assign(manifest.studyAssets.wordDictionary,{sha256:sha256(FILES.dictionary),entries:Object.keys(dictionary).length,referencedLemmas:referenced.size});
writeJson(FILES.manifest,manifest);

const semantic=JSON.parse(execFileSync(process.execPath,['scripts/validate-vocabulary-semantics.mjs'],{cwd:ROOT,encoding:'utf8'}).trim());
if(semantic.status!=='PASS')fail('Semantic validator did not PASS');
const style=JSON.parse(execFileSync(process.execPath,['scripts/audit-vocabulary-dictionary-style.mjs'],{cwd:ROOT,encoding:'utf8'}).trim());
if(style.counts?.singleWordNoHeader!==0||style.counts?.multiPosCombinedHeader!==0||style.counts?.multiPosWithoutSeparateHeaders!==0)fail('Dictionary style audit failed');
const production=JSON.parse(execFileSync(process.execPath,['scripts/assemble-production.mjs','--verify-only'],{cwd:abs('app'),encoding:'utf8'}).trim());
if(production.status!=='PASS')fail('Production verifier did not PASS');

const report={
  schemaVersion:1,patchId:'back-half-a2plus-vocabulary-2026-09-02',status:'PASS',
  scope:{globalSpeechRange:[583,1164],speechCount:582,first:'act2-speech-0057',last:'act2-speech-0638',previousExcluded:'act2-speech-0056'},
  policy:policy.policy,
  review:{candidateCount:candidateRows.length,selectedCandidateLemmas:selected.length,customPhraseAdditions:custom.length,totalIntegratedLemmas:expectedDefinitionKeys.size,mixedA1CandidateExceptions:Object.keys(policy.mixedA1CandidateExceptions||{})},
  before,
  stats:{newDictionaryEntries,newVocabularyItems,alreadyPresent,exactSurfaceCoveredByOtherLemma:exactCovered,phraseCoveredOccurrences:phraseCovered,matchedSpeechSurfaces,inThisPlayAdded},
  after:{dictionaryEntries:Object.keys(dictionary).length,allVocabularyItems:vocabItems,targetVocabularyItems:afterTarget,annotatedSpeeches,playMeaningItems,neutralOnlyItems,inThisPlayItems,referencedDictionaryLemmas:referenced.size},
  qa:{candidateDefinitionReconciliation:'PASS',backHalfBoundary:'PASS',sourceMatchForEverySelectedLemma:'PASS',frontHalfMutationCheck:'PASS',duplicateVocabularyPairs:0,surfaceLemmaConflicts:0,missingDictionaryReferences:0,dictionaryMeaningConsistency:'PASS',optionalInThisPlayContract:'PASS',semanticValidator:semantic,dictionaryStyleAudit:style,productionVerifier:production,protectedCanonicalSourcesUnchanged:true},
  selectedDetails,customDetails,
  hashes:{vocabulary:sha256(FILES.vocabulary),dictionary:sha256(FILES.dictionary)}
};
writeJson(FILES.report,report);
for(const item of contract.files)if(sha256(item.path)!==item.sha256)fail(`Post-QA canonical SHA mismatch ${item.path}`);
console.log(JSON.stringify(report,null,2));
