import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv=process.argv.slice(2);
const arg=(name,fallback)=>{const i=argv.indexOf(name);return i>=0&&argv[i+1]?argv[i+1]:fallback};
const root=path.resolve(arg('--root',path.resolve(process.cwd(),'..')));
const out=path.resolve(arg('--out',path.join(root,'app','mousetrap_grammar_span_validation.json')));
const read=p=>fs.readFileSync(p,'utf8'),fail=m=>{throw new Error(m)},hash=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
const script=JSON.parse(read(path.join(root,'mousetrap_script_data.json')));const effective0308=script?.['act1-scene2']?.speeches?.[307];if(!effective0308||effective0308.id!=='act1-scene2-speech-0308')fail('Production script overlay target missing');effective0308.text='Ah.';const grammar=JSON.parse(read(path.join(root,'mousetrap_line_grammar.json'))),speech={};
for(const [scene,v] of Object.entries(script))for(const sp of v?.speeches||[])speech[sp.id]={scene,text:String(sp.text||'')};
const records=[];let items=0,occurrenceSpans=0,missing=0,markerMissing=0;
for(const [speechId,list] of Object.entries(grammar)){
  if(!speech[speechId])fail(`Grammar orphan speech ${speechId}`);if(!Array.isArray(list))fail(`Grammar list invalid ${speechId}`);
  list.forEach((g,index)=>{
    items++;const description=String(g?.description||''),m=description.match(/原文では「([^」]+)」/)||description.match(/原文の「([^」]+)」/);
    if(!m){markerMissing++;return}
    const evidence=m[1],text=speech[speechId].text,spans=[];let from=0;
    while(from<=text.length-evidence.length){const start=text.indexOf(evidence,from);if(start<0)break;spans.push({start,end:start+evidence.length});from=start+1}
    if(!spans.length){missing++;return}
    occurrenceSpans+=spans.length;records.push({speechId,grammarIndex:index,patternSha256:hash(String(g?.pattern||'')),evidenceSha256:hash(evidence),spans});
  });
}
if(items!==692)fail(`Grammar items ${items}/692`);if(markerMissing)fail(`Grammar evidence marker missing ${markerMissing}`);if(missing)fail(`Grammar evidence not found ${missing}`);if(records.length!==692)fail(`Grammar validation records ${records.length}/692`);
const payload={schemaVersion:1,copyrightSafe:true,source:['mousetrap_line_grammar.json','mousetrap_script_data.json','materials/011_CANONICAL_RECONCILIATION.txt'],records:records.length,occurrenceSpans,failures:0,items:records};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(payload));
console.log(JSON.stringify({status:'PASS',records:records.length,occurrenceSpans,missing,markerMissing,bytes:fs.statSync(out).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex')},null,2));
