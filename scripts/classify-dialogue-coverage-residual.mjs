import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const key=v=>String(v??'').normalize('NFKC').replace(/[’‘]/g,"'").trim().toLowerCase();
const audit=read('data/vocabulary-full-coverage-audit.json');
const focus=read('data/vocabulary-full-coverage-review-focus.json');
const historical=read('data/vocabulary-full-coverage-historical-crosscheck.json');
const poly=read('data/vocabulary-full-coverage-polysemy-residual.json');
const suspiciousRepair=read('data/vocabulary-full-coverage-suspicious-repair.json');
const safeKinds=['ADD_EXISTING_SURFACE','ADD_EXACT_DICTIONARY','ADD_MORPHOLOGY'];
const safeResidual=(audit.candidates||[]).filter(x=>safeKinds.includes(x.kind));
const polyResidual=(audit.candidates||[]).filter(x=>String(x.kind).startsWith('REVIEW_POLYSEMY_'));
const suspiciousResidual=focus.suspiciousUnknowns||[];
if(safeResidual.length)throw new Error(`safe coverage residual ${safeResidual.length}`);
if(polyResidual.length||poly?.counts?.occurrences)throw new Error(`polysemy coverage residual ${polyResidual.length}/${poly?.counts?.occurrences}`);
if(historical.historicalMissTokenTypes!==0)throw new Error(`historical B1+/Oxford miss types ${historical.historicalMissTokenTypes}`);
if(suspiciousResidual.length)throw new Error(`suspicious dialogue token types remain ${suspiciousResidual.length}`);

const grouped=new Map();
for(const c of audit.candidates||[]){
  if(c.kind!=='REVIEW_NEW_LEXEME_OR_EXCLUSION')continue;
  const k=key(c.surface); if(!grouped.has(k))grouped.set(k,[]); grouped.get(k).push(c);
}
const noise=new Set(['dum','hm','hmm','mm','ugh','gosh','hullo','hello','ha','ah','oh','eh','er','um','uh']);
const grammatical=new Set(["everyone's","someone's","anyone's","nobody's","everything's","nothing's"]);
const classifications=[];
for(const [token,rows] of [...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
  let category='INTENTIONAL_BASIC_OR_TRANSPARENT';
  let rationale='Not selected by prior B1+/Oxford review, not flagged by the long/rare suspicious review after the overinclusive repair pass, and not polysemous in the current production dictionary.';
  if(noise.has(token)){category='VOCALIZATION_OR_DISCOURSE_NOISE';rationale='Vocalization/interjection-like token rather than a lexical lookup target for this dialogue vocabulary layer.';}
  else if(grammatical.has(token)){category='GRAMMATICAL_CONTRACTION_OR_POSSESSIVE';rationale='Transparent grammatical contraction/possessive handled by grammar rather than a separate dictionary lexeme.';}
  classifications.push({token,count:rows.length,category,rationale,speechIds:[...new Set(rows.map(x=>x.speechId))]});
}
const proper=(audit.candidates||[]).filter(x=>x.kind==='DEFER_PROPER_NOUN_PHASE3');
const properGroups=new Map();for(const c of proper){const k=key(c.surface);if(!properGroups.has(k))properGroups.set(k,[]);properGroups.get(k).push(c);}
const deferredProper=[...properGroups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([token,rows])=>({token,count:rows.length,category:'DEFER_PROPER_NOUN_PHASE3',speechIds:[...new Set(rows.map(x=>x.speechId))]}));
const counts={
  canonicalSpeeches:audit.counts.canonicalSpeeches,
  vocabularyItems:audit.counts.vocabularyItems,
  dictionaryEntries:audit.counts.dictionaryEntries,
  safeResidualOccurrences:safeResidual.length,
  polysemyResidualOccurrences:polyResidual.length,
  historicalMissTokenTypes:historical.historicalMissTokenTypes,
  suspiciousResidualTokenTypes:suspiciousResidual.length,
  intentionalBasicOrTransparentTypes:classifications.filter(x=>x.category==='INTENTIONAL_BASIC_OR_TRANSPARENT').length,
  vocalizationOrNoiseTypes:classifications.filter(x=>x.category==='VOCALIZATION_OR_DISCOURSE_NOISE').length,
  grammaticalTypes:classifications.filter(x=>x.category==='GRAMMATICAL_CONTRACTION_OR_POSSESSIVE').length,
  deferredProperNounTypes:deferredProper.length,
  unreviewedTokenTypes:0
};
const out={schemaVersion:1,status:'PASS',policy:{dialogueOnly:true,overinclusiveSuspiciousReview:true,historicalSelectionCrosscheckRequired:true,polysemyMustBeResolved:true,properNounsDeferredToPhase3:true,remainingBasicTokensExplicitlyClassified:true},counts,suspiciousRepairSummary:{reviewedSuspiciousTokenTypes:suspiciousRepair.reviewedSuspiciousTokenTypes,addedDictionaryEntries:suspiciousRepair.addedDictionaryEntries,addedVocabularyItems:suspiciousRepair.addedVocabularyItems,deferredToPhase3:suspiciousRepair.deferredToPhase3,excluded:suspiciousRepair.excluded},residualClassifications:classifications,deferredProperNouns:deferredProper};
write('data/vocabulary-full-coverage-classification.json',out);console.log(JSON.stringify({status:out.status,counts},null,2));
