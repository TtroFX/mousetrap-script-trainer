import fs from 'node:fs';
const r=p=>JSON.parse(fs.readFileSync(p,'utf8'));const w=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const audit=r('data/vocabulary-full-coverage-audit.json'),script=r('mousetrap_script_data.json');const byId=new Map(Object.values(script).flatMap(x=>x?.speeches||[]).map(x=>[x.id,x]));
const groups={};for(const c of audit.candidates||[]){if(!String(c.kind).startsWith('REVIEW_POLYSEMY_'))continue;(groups[c.lemma]??=[]).push({speechId:c.speechId,surface:c.surface,kind:c.kind,speaker:c.speaker,text:byId.get(c.speechId)?.text||''});}
const out={schemaVersion:1,status:'REVIEW_REQUIRED',counts:{lemmas:Object.keys(groups).length,occurrences:Object.values(groups).reduce((n,x)=>n+x.length,0)},groups};w('data/vocabulary-full-coverage-polysemy-residual.json',out);console.log(JSON.stringify(out,null,2));
