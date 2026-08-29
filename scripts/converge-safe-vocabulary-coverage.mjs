import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const SAFE=new Set(['ADD_EXISTING_SURFACE','ADD_EXACT_DICTIONARY','ADD_MORPHOLOGY']);
let passes=0,totalAdded=0;
for(;passes<12;passes++){
  execFileSync(process.execPath,['scripts/audit-vocabulary-full-coverage.mjs'],{stdio:'inherit'});
  const audit=read('data/vocabulary-full-coverage-audit.json');
  const residual=(audit.candidates||[]).filter(x=>SAFE.has(x.kind));
  if(residual.length===0){
    console.log(JSON.stringify({status:'CONVERGED',passes,safeResidual:0,totalAdded},null,2));
    process.exit(0);
  }
  execFileSync(process.execPath,['scripts/apply-safe-vocabulary-full-coverage.mjs'],{stdio:'inherit'});
  const repair=read('data/vocabulary-full-coverage-safe-repair.json');
  totalAdded+=Number(repair.addedVocabularyItems||0);
  if(Number(repair.addedVocabularyItems||0)===0)throw new Error(`safe coverage stalled with ${residual.length} residual candidates`);
}
throw new Error('safe coverage did not converge within 12 passes');
