import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const key=v=>String(v??'').normalize('NFKC').replace(/[’‘]/g,"'").trim().toLowerCase();
const dir='data/vocabulary-rebuild';
const files=fs.readdirSync(dir);
const selectedForms=new Map();
const add=(form,lemma,source)=>{const f=key(form),l=String(lemma||form);if(!f)return;if(!selectedForms.has(f))selectedForms.set(f,[]);selectedForms.get(f).push({lemma:l,source});};
for(const file of files){
  if(!file.endsWith('.json'))continue;
  let data; try{data=read(`${dir}/${file}`);}catch{continue;}
  if(/b1plus-coverage\.json$/.test(file)&&data?.lines){
    for(const rows of Object.values(data.lines))for(const x of rows||[]){add(x.surface,x.lemma,file);add(x.lemma,x.lemma,file);}
  }
  if(/oxford-review\.json$/.test(file)&&Array.isArray(data?.includeLexemes)){
    for(const x of data.includeLexemes){add(x.word||x.lemma,x.lemma||x.word,file);add(x.lemma||x.word,x.lemma||x.word,file);for(const form of x.forms||[])add(form,x.lemma||x.word,file);}
  }
}
const audit=read('data/vocabulary-full-coverage-audit.json');
const unresolved=(audit.candidates||[]).filter(x=>x.kind==='REVIEW_NEW_LEXEME_OR_EXCLUSION');
const byToken=new Map();
for(const c of unresolved){const k=key(c.surface);if(!byToken.has(k))byToken.set(k,[]);byToken.get(k).push(c);}
const historicalMisses=[];
for(const [token,rows] of byToken){
  const refs=selectedForms.get(token); if(!refs?.length)continue;
  historicalMisses.push({token,count:rows.length,expectedLemmas:[...new Set(refs.map(r=>r.lemma))],sources:[...new Set(refs.map(r=>r.source))],speechIds:[...new Set(rows.map(r=>r.speechId))]});
}
historicalMisses.sort((a,b)=>b.count-a.count||a.token.localeCompare(b.token));
const report={schemaVersion:1,status:'CROSSCHECK_COMPLETE',historicalSelectedFormTypes:selectedForms.size,unresolvedTokenTypes:byToken.size,historicalMissTokenTypes:historicalMisses.length,historicalMissOccurrences:historicalMisses.reduce((n,x)=>n+x.count,0),historicalMisses};
write('data/vocabulary-full-coverage-historical-crosscheck.json',report);console.log(JSON.stringify(report,null,2));
