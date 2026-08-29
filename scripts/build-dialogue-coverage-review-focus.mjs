import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const key=v=>String(v??'').normalize('NFKC').replace(/[’‘]/g,"'").trim().toLowerCase();
const audit=read('data/vocabulary-full-coverage-audit.json');
const script=read('mousetrap_script_data.json');
const speeches=Object.values(script).flatMap(s=>s?.speeches||[]);
const byId=new Map(speeches.map(s=>[s.id,s]));
const poly=(audit.candidates||[]).filter(x=>String(x.kind).startsWith('REVIEW_POLYSEMY_')).map(x=>({...x,text:byId.get(x.speechId)?.text||''}));
const unknown=(audit.candidates||[]).filter(x=>x.kind==='REVIEW_NEW_LEXEME_OR_EXCLUSION');
const grouped=new Map();
for(const x of unknown){const k=key(x.surface);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(x);}
const suspicious=[];
for(const [token,rows] of grouped){
  const score=(token.length>=10?3:token.length>=8?2:0)+(rows.length<=1?2:rows.length<=3?1:0)+(token.includes("'")?-2:0);
  if(score<3)continue;
  suspicious.push({token,count:rows.length,length:token.length,score,examples:rows.slice(0,3).map(x=>({speechId:x.speechId,speaker:x.speaker,text:byId.get(x.speechId)?.text||''}))});
}
suspicious.sort((a,b)=>b.score-a.score||b.length-a.length||a.token.localeCompare(b.token));
const out={schemaVersion:1,status:'REVIEW_FOCUS_BUILT',counts:{polysemyOccurrences:poly.length,polysemyLemmas:new Set(poly.map(x=>x.lemma)).size,unknownTokenTypes:grouped.size,suspiciousTokenTypes:suspicious.length},polysemy:poly,suspiciousUnknowns:suspicious};
write('data/vocabulary-full-coverage-review-focus.json',out);console.log(JSON.stringify({counts:out.counts,polysemy:poly.map(x=>`${x.speechId}|${x.lemma}|${x.surface}`),suspicious:suspicious.map(x=>`${x.token}|${x.count}`)},null,2));
