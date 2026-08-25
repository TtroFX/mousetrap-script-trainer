import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv=process.argv.slice(2);
const arg=(name,fallback)=>{const i=argv.indexOf(name);return i>=0&&argv[i+1]?argv[i+1]:fallback};
const root=path.resolve(arg('--root',path.resolve(process.cwd(),'..')));
const out=path.resolve(arg('--out',path.join(root,'app','mousetrap_line_structure.json')));
const materials=path.join(root,'materials');
const read=p=>fs.readFileSync(p,'utf8');
const fail=m=>{throw new Error(m)};

const SCENES={
  A01S01:{sceneId:'act1-scene1',sceneCode:'SCN-A01-S01',unitPrefix:'U-A01-S01',speechPrefix:'act1-scene1-speech-',expectedSpeeches:190,expectedSentences:453,expectedChunks:1554},
  A01S02:{sceneId:'act1-scene2',sceneCode:'SCN-A01-S02',unitPrefix:'U-A01-S02',speechPrefix:'act1-scene2-speech-',expectedSpeeches:336,expectedSentences:643,expectedChunks:2221},
  A02S01:{sceneId:'act2',sceneCode:'SCN-A02-S01',unitPrefix:'U-A02-S01',speechPrefix:'act2-speech-',expectedSpeeches:638,expectedSentences:1181,expectedChunks:4280}
};
const ROLE_SET=new Set(['S','V','O','C','M',"S'","V'","O'","C'"]);
const TYPE_SET=new Set(['NP','VP','PP','AdvP','AdjP','NC','AC','AdvC','Inf','Gerund','Participle','PhrasalVerb','FixedExpression']);
const FROZEN_A01S02_SHARDS={
  '003-02A_CHUNKS_A01S02.txt':'0d7d49e346d3a2e96f6d339a8027eb778116142e3e94f532c55d929a91067307',
  '003-02B_CHUNKS_A01S02.txt':'bd24466fd9293a70cb0f550609f3c9c4dad943cf62c3a3ad80c238d11b59283a',
  '003-02C_CHUNKS_A01S02.txt':'2ee444bb916b573fec29944e93eff4046fa505cd5e9ce540b26b9b92ce7fe892'
};
const FORBIDDEN_SINGLE=new Set(['the','a','an','of','to','very','for','in','on','at','with','from','by']);

function sceneSpec(filename,text=''){
  const joined=`${filename}\n${text.slice(0,300)}`;
  if(/A01S01|SCN-A01-S01/.test(joined))return SCENES.A01S01;
  if(/A01S02|SCN-A01-S02/.test(joined))return SCENES.A01S02;
  if(/A02S01|SCN-A02-S01/.test(joined))return SCENES.A02S01;
  return null;
}
function parseRecord(line,spec,source){
  const m=line.match(/^(\d{4})\.(\d{2})(!)?\|(.+)$/);
  if(!m)return null;
  const unitSeq=m[1],sentNo=m[2],highRisk=!!m[3],raw=m[4];
  const chunks=raw.split(';').filter(Boolean).map(token=>{
    const cm=token.match(/^(\d{2})@(\d+)-(\d+):([^:]+):([^:]+)$/);
    if(!cm)fail(`Bad chunk token ${source}: ${token}`);
    const [,chunkNo,a,b,role,type]=cm;
    const start=Number(a),end=Number(b);
    if(!ROLE_SET.has(role))fail(`Unknown role ${role} in ${source}`);
    if(!TYPE_SET.has(type))fail(`Unknown grammar type ${type} in ${source}`);
    if(!(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end>start))fail(`Bad span ${token}`);
    return {chunkNo,start,end,role,type};
  });
  if(!chunks.length)fail(`Empty sentence record ${source}: ${line}`);
  chunks.sort((a,b)=>a.start-b.start||a.end-b.end);
  let cursor=0;
  chunks.forEach((c,i)=>{
    const expected=String(i+1).padStart(2,'0');
    if(c.chunkNo!==expected)fail(`Chunk number sequence ${source} ${unitSeq}.${sentNo}: expected ${expected}, got ${c.chunkNo}`);
    if(c.start!==cursor)fail(`Chunk coverage gap/overlap ${source} ${unitSeq}.${sentNo}: expected ${cursor}, got ${c.start}`);
    cursor=c.end;
  });
  return {sceneId:spec.sceneId,sceneCode:spec.sceneCode,unitSeq,sentNo,highRisk,chunks,length:cursor,source};
}

const frozenShardAudit={};
for(const [name,expected] of Object.entries(FROZEN_A01S02_SHARDS)){
  const file=path.join(materials,name);if(!fs.existsSync(file))fail(`Missing frozen shard ${name}`);
  const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  frozenShardAudit[name]={expected,actual,match:actual===expected};
}

const entries=fs.readdirSync(materials,{withFileTypes:true}).filter(x=>x.isFile()).map(x=>x.name);
const chunkFiles=entries.filter(name=>/^003-.*(?:CHUNKS|CORRECTION_U0053).*\.txt$/.test(name));
const base=new Map();
const overlay=[];
for(const name of chunkFiles){
  const file=path.join(materials,name),text=read(file),spec=sceneSpec(name,text);
  if(!spec)continue;
  for(const line of text.split(/\r?\n/)){
    const record=parseRecord(line.trim(),spec,name);if(!record)continue;
    const key=`${spec.sceneId}|${record.unitSeq}.${record.sentNo}`;
    if(name==='003-03A0_CORRECTION_U0053.txt')overlay.push([key,record]);
    else if(base.has(key))fail(`Duplicate base sentence ${key} (${base.get(key).source}, ${name})`);
    else base.set(key,record);
  }
}
for(const [key,record] of overlay)base.set(key,record);
if(base.size!==2277)fail(`Sentence records ${base.size}/2277`);

const rawSceneStats={};
const rawSourceStats={};
for(const spec of Object.values(SCENES)){
  const records=[...base.values()].filter(r=>r.sceneId===spec.sceneId);
  rawSceneStats[spec.sceneId]={sentences:records.length,chunks:records.reduce((n,r)=>n+r.chunks.length,0),expectedSentences:spec.expectedSentences,expectedChunks:spec.expectedChunks};
  for(const r of records){const k=r.source;rawSourceStats[k]??={sentences:0,chunks:0};rawSourceStats[k].sentences++;rawSourceStats[k].chunks+=r.chunks.length}
}

const script=JSON.parse(read(path.join(root,'mousetrap_script_data.json')));
function skipWs(text,cursor){while(cursor<text.length&&/\s/u.test(text[cursor]))cursor++;return cursor}
function words(text){return String(text).toLowerCase().match(/[a-z]+(?:['’][a-z]+)?/g)||[]}
const lexicalAudit={insideWordBoundary:[],forbiddenSingle:[],adjacentSameRoleType:[],longChunks:[]};
function alignSpeech(text,records,speechId,spec){
  let cursor=0;const sentences=[];
  for(const record of records){
    cursor=skipWs(text,cursor);
    const start=cursor,end=start+record.length;
    if(end>text.length)fail(`Sentence span exceeds speech ${speechId} ${record.unitSeq}.${record.sentNo}: ${end}/${text.length}`);
    const sentenceText=text.slice(start,end);
    let chunkCursor=0;
    record.chunks.forEach((c,i)=>{
      if(c.start!==chunkCursor||c.end>sentenceText.length)fail(`Chunk reconstruction mismatch ${speechId} ${record.sentNo}`);
      const chunkText=sentenceText.slice(c.start,c.end),lex=words(chunkText);
      const id=`${spec.sceneId}:${record.unitSeq}.${record.sentNo}.${c.chunkNo}`;
      if(spec.sceneId==='act1-scene2'){
        if(lex.length===1&&FORBIDDEN_SINGLE.has(lex[0]))lexicalAudit.forbiddenSingle.push(id);
        if(lex.length>=10)lexicalAudit.longChunks.push(`${id}:${lex.length}`);
        if(i>0){
          const p=record.chunks[i-1],boundary=c.start,left=sentenceText[boundary-1]||'',right=sentenceText[boundary]||'';
          if(/[A-Za-z0-9]/.test(left)&&/[A-Za-z0-9]/.test(right))lexicalAudit.insideWordBoundary.push(id);
          if(p.role===c.role&&p.type===c.type)lexicalAudit.adjacentSameRoleType.push(`${spec.sceneId}:${record.unitSeq}.${record.sentNo}.${p.chunkNo}-${c.chunkNo}:${c.role}:${c.type}`);
        }
      }
      chunkCursor=c.end;
    });
    if(chunkCursor!==sentenceText.length)fail(`Sentence length mismatch ${speechId} ${record.sentNo}: ${chunkCursor}/${sentenceText.length}`);
    const sentenceId=`SEN-${record.sceneCode.replace('SCN-','U-')}-${record.unitSeq}-${record.sentNo}`;
    const chunks=record.chunks.map(c=>({id:`CHK-${sentenceId}-${c.chunkNo}`,start:c.start,end:c.end,role:c.role,type:c.type}));
    sentences.push({id:sentenceId,start,end,highRisk:record.highRisk,chunks});
    cursor=end;
  }
  cursor=skipWs(text,cursor);
  if(cursor!==text.length)fail(`Speech alignment residue ${speechId}: ${cursor}/${text.length} ${JSON.stringify(text.slice(cursor,cursor+30))}`);
  return sentences;
}

const lines={};
const sceneStats={};
let speechTotal=0,sentenceTotal=0,chunkTotal=0;
for(const spec of Object.values(SCENES)){
  const speeches=script?.[spec.sceneId]?.speeches;
  if(!Array.isArray(speeches)||speeches.length!==spec.expectedSpeeches)fail(`Script scene ${spec.sceneId}: ${speeches?.length||0}/${spec.expectedSpeeches}`);
  let ss=0,cc=0;
  speeches.forEach((speech,index)=>{
    const ordinal=index+1,unitSeq=String(ordinal+1).padStart(4,'0');
    const prefix=`${spec.sceneId}|${unitSeq}.`;
    const records=[...base.entries()].filter(([k])=>k.startsWith(prefix)).map(([,r])=>r).sort((a,b)=>Number(a.sentNo)-Number(b.sentNo));
    if(!records.length)fail(`No sentence structure for ${speech.id} (${spec.sceneId} unit ${unitSeq})`);
    records.forEach((r,i)=>{if(Number(r.sentNo)!==i+1)fail(`Sentence ordinal gap ${speech.id}: ${r.sentNo} at ${i+1}`)});
    const sentences=alignSpeech(String(speech.text||''),records,speech.id,spec);
    lines[speech.id]={sceneId:spec.sceneId,unitId:`${spec.unitPrefix}-${unitSeq}`,ordinal,sentences};
    ss+=sentences.length;cc+=sentences.reduce((n,s)=>n+s.chunks.length,0);
  });
  sceneStats[spec.sceneId]={speeches:speeches.length,sentences:ss,chunks:cc};
  speechTotal+=speeches.length;sentenceTotal+=ss;chunkTotal+=cc;
}
if(speechTotal!==1164||sentenceTotal!==2277)fail(`Global speech/sentence counts ${speechTotal}/1164 ${sentenceTotal}/2277`);

function parseCharacters(){
  const file=path.join(materials,'010_CHARACTER_INDEX.txt');
  if(!fs.existsSync(file))return {};
  const text=read(file),out={};
  for(const block of text.split(/={20,}/)){
    const id=block.match(/\[(SPK-[A-Z0-9-]+)\]/)?.[1];if(!id)continue;
    const value=k=>block.match(new RegExp(`^${k}:\\s*(.+)$`,'m'))?.[1]?.trim()||'';
    out[id]={sourceLabel:value('SOURCE_LABEL'),displayName:value('DISPLAY_NAME'),shortName:value('UI_SHORT_NAME'),speakerCode:value('SPEAKER_CODE'),type:value('TYPE'),practiceSelectable:value('PRACTICE_SELECTABLE')==='YES',speechCount:Number(value('CANONICAL_SPEECH_COUNT'))||0,forms:value('SCRIPT_FACING_FORMS').split(';').map(x=>x.trim()).filter(Boolean)};
  }
  if(Object.keys(out).length!==9)fail(`Character registry ${Object.keys(out).length}/9`);
  return out;
}

const reconciliation={frozenShardAudit,rawSceneStats,rawSourceStats,lexicalAudit,actualCounts:{speeches:speechTotal,sentences:sentenceTotal,chunks:chunkTotal},declaredCounts:{speeches:1164,sentences:2277,chunks:8055}};
if(chunkTotal!==8055||Object.values(frozenShardAudit).some(x=>!x.match))fail(`CANONICAL_RECONCILIATION_REQUIRED ${JSON.stringify(reconciliation)}`);

const payload={schemaVersion:1,source:'materials/002 + materials/003 + materials/010',copyrightSafe:true,coordinateSystem:'speech-local sentences; sentence-local zero-based half-open chunk spans',counts:{speeches:speechTotal,sentences:sentenceTotal,chunks:chunkTotal},sceneStats,roles:[...ROLE_SET],grammarTypes:[...TYPE_SET],memoryStages:['M0_FULL','M1_CHUNK_GAPS','M2_INITIAL_HINTS','M3_HIDDEN'],characters:parseCharacters(),lines};
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(payload));
console.log(JSON.stringify({status:'PASS',out,counts:payload.counts,characters:Object.keys(payload.characters).length,bytes:fs.statSync(out).size},null,2));
