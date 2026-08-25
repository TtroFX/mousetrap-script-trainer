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
  A01S01:{sceneId:'act1-scene1',sceneCode:'SCN-A01-S01',unitPrefix:'U-A01-S01',expectedSpeeches:190,expectedSentences:453,declaredChunks:1554,materializedChunks:1554},
  A01S02:{sceneId:'act1-scene2',sceneCode:'SCN-A01-S02',unitPrefix:'U-A01-S02',expectedSpeeches:336,expectedSentences:643,declaredChunks:2221,materializedChunks:2223},
  A02S01:{sceneId:'act2',sceneCode:'SCN-A02-S01',unitPrefix:'U-A02-S01',expectedSpeeches:638,expectedSentences:1181,declaredChunks:4280,materializedChunks:4280}
};
const ROLE_SET=new Set(['S','V','O','C','M',"S'","V'","O'","C'"]);
const TYPE_SET=new Set(['NP','VP','PP','AdvP','AdjP','NC','AC','AdvC','Inf','Gerund','Participle','PhrasalVerb','FixedExpression']);
const DECLARED={speeches:1164,sentences:2277,chunks:8055};
const MATERIALIZED={speeches:1164,sentences:2277,chunks:8057};
const FROZEN_A01S02_SHARDS={
  '003-02A_CHUNKS_A01S02.txt':'0d7d49e346d3a2e96f6d339a8027eb778116142e3e94f532c55d929a91067307',
  '003-02B_CHUNKS_A01S02.txt':'bd24466fd9293a70cb0f550609f3c9c4dad943cf62c3a3ad80c238d11b59283a',
  '003-02C_CHUNKS_A01S02.txt':'2ee444bb916b573fec29944e93eff4046fa505cd5e9ce540b26b9b92ce7fe892'
};

function sceneSpec(filename,text=''){
  const probe=`${filename}\n${text.slice(0,300)}`;
  if(/A01S01|SCN-A01-S01/.test(probe))return SCENES.A01S01;
  if(/A01S02|SCN-A01-S02/.test(probe))return SCENES.A01S02;
  if(/A02S01|SCN-A02-S01/.test(probe))return SCENES.A02S01;
  return null;
}
function parseRecord(line,spec,source){
  const m=line.match(/^(\d{4})\.(\d{2})(!)?\|(.+)$/);if(!m)return null;
  const unitSeq=m[1],sentNo=m[2],highRisk=!!m[3];
  const chunks=m[4].split(';').filter(Boolean).map(token=>{
    const cm=token.match(/^(\d{2})@(\d+)-(\d+):([^:]+):([^:]+)$/);if(!cm)fail(`Bad chunk token ${source}: ${token}`);
    const [,chunkNo,a,b,role,type]=cm,start=Number(a),end=Number(b);
    if(!ROLE_SET.has(role))fail(`Unknown role ${role} in ${source}`);
    if(!TYPE_SET.has(type))fail(`Unknown grammar type ${type} in ${source}`);
    if(!(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end>start))fail(`Bad span ${token}`);
    return{chunkNo,start,end,role,type};
  });
  if(!chunks.length)fail(`Empty sentence ${source} ${unitSeq}.${sentNo}`);
  let cursor=0;chunks.forEach((c,i)=>{const expected=String(i+1).padStart(2,'0');if(c.chunkNo!==expected)fail(`Chunk number ${source} ${unitSeq}.${sentNo}: ${c.chunkNo}/${expected}`);if(c.start!==cursor)fail(`Chunk coverage ${source} ${unitSeq}.${sentNo}: ${c.start}/${cursor}`);cursor=c.end});
  return{sceneId:spec.sceneId,sceneCode:spec.sceneCode,unitSeq,sentNo,highRisk,chunks,length:cursor,source};
}
function sentenceId(record){return`SEN-${record.sceneCode.replace('SCN-','U-')}-${record.unitSeq}-${record.sentNo}`}
function exportChunks(record){const sid=sentenceId(record);return record.chunks.map(c=>({id:`CHK-${sid}-${c.chunkNo}`,start:c.start,end:c.end,role:c.role,type:c.type}))}
function rawSentence(record){return{id:sentenceId(record),expectedLength:record.length,highRisk:record.highRisk,chunks:exportChunks(record)}}
function skipWs(text,cursor){while(cursor<text.length&&/\s/u.test(text[cursor]))cursor++;return cursor}
function tryExactSpeechMap(text,records){
  let cursor=0;const sentences=[];
  for(const record of records){cursor=skipWs(text,cursor);const start=cursor,end=start+record.length;if(end>text.length)return null;sentences.push({id:sentenceId(record),start,end,expectedLength:record.length,highRisk:record.highRisk,chunks:exportChunks(record)});cursor=end}
  cursor=skipWs(text,cursor);return cursor===text.length?sentences:null;
}

const shardAudit={};
for(const [name,expected] of Object.entries(FROZEN_A01S02_SHARDS)){
  const file=path.join(materials,name);if(!fs.existsSync(file))fail(`Missing shard ${name}`);
  const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');shardAudit[name]={expected,actual,match:actual===expected};
}

const entries=fs.readdirSync(materials,{withFileTypes:true}).filter(x=>x.isFile()).map(x=>x.name);
const chunkFiles=entries.filter(name=>/^003-.*(?:CHUNKS|CORRECTION_U0053).*\.txt$/.test(name));
const records=new Map(),overlay=[];
for(const name of chunkFiles){
  const text=read(path.join(materials,name)),spec=sceneSpec(name,text);if(!spec)continue;
  for(const raw of text.split(/\r?\n/)){const record=parseRecord(raw.trim(),spec,name);if(!record)continue;const key=`${spec.sceneId}|${record.unitSeq}.${record.sentNo}`;if(name==='003-03A0_CORRECTION_U0053.txt')overlay.push([key,record]);else if(records.has(key))fail(`Duplicate base sentence ${key}`);else records.set(key,record)}
}
for(const [key,record] of overlay)records.set(key,record);
if(records.size!==MATERIALIZED.sentences)fail(`Sentence records ${records.size}/${MATERIALIZED.sentences}`);

const byUnit=new Map();for(const r of records.values()){const key=`${r.sceneId}|${r.unitSeq}`;if(!byUnit.has(key))byUnit.set(key,[]);byUnit.get(key).push(r)}for(const a of byUnit.values())a.sort((x,y)=>Number(x.sentNo)-Number(y.sentNo));
const rawSceneStats={};for(const spec of Object.values(SCENES)){const a=[...records.values()].filter(r=>r.sceneId===spec.sceneId),chunks=a.reduce((n,r)=>n+r.chunks.length,0);rawSceneStats[spec.sceneId]={sentences:a.length,chunks,declaredChunks:spec.declaredChunks};if(a.length!==spec.expectedSentences||chunks!==spec.materializedChunks)fail(`Materialized scene mismatch ${spec.sceneId}: ${a.length}/${spec.expectedSentences} ${chunks}/${spec.materializedChunks}`)}
const actualChunks=[...records.values()].reduce((n,r)=>n+r.chunks.length,0);if(actualChunks!==MATERIALIZED.chunks)fail(`Materialized chunks ${actualChunks}/${MATERIALIZED.chunks}`);

const script=JSON.parse(read(path.join(root,'mousetrap_script_data.json'))),lines={},rawLines={};
const sceneStats={},mappingStats={fullCoverage:0,fallback:0};let speechTotal=0,sentenceTotal=0,chunkTotal=0;
for(const spec of Object.values(SCENES)){
  const speeches=script?.[spec.sceneId]?.speeches;if(!Array.isArray(speeches)||speeches.length!==spec.expectedSpeeches)fail(`Script scene ${spec.sceneId}: ${speeches?.length||0}/${spec.expectedSpeeches}`);
  let ss=0,cc=0,mapped=0,fallback=0;
  speeches.forEach((speech,index)=>{
    const ordinal=index+1,unitSeq=String(ordinal+1).padStart(4,'0'),unitRecords=byUnit.get(`${spec.sceneId}|${unitSeq}`)||[];
    if(!unitRecords.length)fail(`No 003 structure for ${speech.id}`);unitRecords.forEach((r,i)=>{if(Number(r.sentNo)!==i+1)fail(`Sentence ordinal gap ${speech.id}`)});
    const mappedSentences=tryExactSpeechMap(String(speech.text||''),unitRecords),base={sceneId:spec.sceneId,unitId:`${spec.unitPrefix}-${unitSeq}`,ordinal};
    if(mappedSentences){lines[speech.id]={...base,coverage:'full',sentences:mappedSentences};mapped++;mappingStats.fullCoverage++}else{rawLines[speech.id]={...base,coverage:'fallback',sentences:unitRecords.map(rawSentence)};fallback++;mappingStats.fallback++}
    ss+=unitRecords.length;cc+=unitRecords.reduce((n,r)=>n+r.chunks.length,0);
  });
  if(ss!==spec.expectedSentences||cc!==spec.materializedChunks)fail(`Scene export mismatch ${spec.sceneId}`);
  sceneStats[spec.sceneId]={speeches:speeches.length,sentences:ss,chunks:cc,fullCoverage:mapped,fallback};speechTotal+=speeches.length;sentenceTotal+=ss;chunkTotal+=cc;
}
if(speechTotal!==MATERIALIZED.speeches||sentenceTotal!==MATERIALIZED.sentences||chunkTotal!==MATERIALIZED.chunks)fail(`Global materialized counts ${speechTotal}/${sentenceTotal}/${chunkTotal}`);
if(Object.keys(lines).length+Object.keys(rawLines).length!==MATERIALIZED.speeches)fail('Speech mapping coverage incomplete');

function parseCharacters(){
  const file=path.join(materials,'010_CHARACTER_INDEX.txt');if(!fs.existsSync(file))return{};const text=read(file),out={};
  for(const block of text.split(/={20,}/)){const id=block.match(/\[(SPK-[A-Z0-9-]+)\]/)?.[1];if(!id)continue;const value=k=>block.match(new RegExp(`^${k}:\\s*(.+)$`,'m'))?.[1]?.trim()||'';out[id]={sourceLabel:value('SOURCE_LABEL'),displayName:value('DISPLAY_NAME'),shortName:value('UI_SHORT_NAME'),speakerCode:value('SPEAKER_CODE'),type:value('TYPE'),practiceSelectable:value('PRACTICE_SELECTABLE')==='YES',speechCount:Number(value('CANONICAL_SPEECH_COUNT'))||0,forms:value('SCRIPT_FACING_FORMS').split(';').map(x=>x.trim()).filter(Boolean)}}
  if(Object.keys(out).length!==9)fail(`Character registry ${Object.keys(out).length}/9`);return out;
}

const sourceAudit={reconciliationStatus:'DECLARED_METADATA_MISMATCH',declaredCounts:DECLARED,materializedCounts:MATERIALIZED,sceneStats:rawSceneStats,shardAudit,notes:['003 source materials remain unchanged','Act I Scene II committed shards materialize 2223 chunks while frozen metadata declares 2221','runtime uses exact speech mapping only when full character coverage is provable; otherwise Reader falls back without applying unsafe offsets']};
const payload={schemaVersion:1,source:'materials/002 + materials/003 + materials/010',copyrightSafe:true,coordinateSystem:'exact-mapped lines use speech-local sentence spans and sentence-local zero-based half-open chunk spans; fallback lines retain canonical expected lengths only',counts:DECLARED,materializedCounts:MATERIALIZED,sceneStats,mappingStats,sourceAudit,roles:[...ROLE_SET],grammarTypes:[...TYPE_SET],memoryStages:['M0_FULL','M1_CHUNK_GAPS','M2_INITIAL_HINTS','M3_HIDDEN'],characters:parseCharacters(),lines,rawLines};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(payload));console.log(JSON.stringify({status:'PASS',out,declaredCounts:payload.counts,materializedCounts:payload.materializedCounts,mappingStats,shardMismatch:Object.values(shardAudit).filter(x=>!x.match).length,characters:Object.keys(payload.characters).length,bytes:fs.statSync(out).size},null,2));
