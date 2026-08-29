import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const canonicalPath=path.join(root,'mousetrap_stage_directions.json');
const runtimePath=path.join(root,'app/src/mousetrap_stage_directions.json');
const source=JSON.parse(fs.readFileSync(canonicalPath,'utf8'));
const scenes=[
  {id:'act1-scene1',act:1,scene:1,speeches:190},
  {id:'act1-scene2',act:1,scene:2,speeches:336},
  {id:'act2',act:2,scene:null,speeches:638},
];
const ordinal=speechId=>Number(String(speechId||'').match(/speech-(\d{4})$/)?.[1]||0);
const categoryFor=entry=>{
  if(entry.kind==='scene-setting')return'scene-setting';
  if(entry.placement==='delivery')return'delivery';
  const text=String(entry.text||'').normalize('NFKC').toLowerCase();
  const rules=[
    ['curtain',/\b(?:quick\s+curtain|curtain)\b/],
    ['light',/\b(?:lights?|lighting|blackout|darkness)\b/],
    ['radio',/\b(?:radio|wireless|broadcast)\b/],
    ['music',/\b(?:music|piano|tune|melody|sing(?:s|ing)?|hum(?:s|ming)?|whistle(?:s|d|ing)?)\b/],
    ['sound',/\b(?:rings?|bell|knock(?:s|ed|ing)?|bang|sound|noise|telephone|doorbell)\b/],
    ['entrance',/\b(?:enter(?:s|ed|ing)?|comes?\s+in|appears?)\b/],
    ['exit',/\b(?:exit(?:s|ed|ing)?|goes?\s+out|leaves?|disappears?)\b/],
    ['pause',/\b(?:pause|silence|silent|beat)\b/],
    ['gesture',/\b(?:smiles?|grins?|nods?|shrugs?|frowns?|laughs?|looks?|glances?|stares?|gestures?)\b/],
    ['movement',/\b(?:crosses?|moves?|walks?|runs?|rushes?|rises?|sits?|stands?|turns?|goes?\s+to|comes?\s+to|kneels?|approaches?)\b/],
  ];
  return rules.find(([,pattern])=>pattern.test(text))?.[0]||'action';
};
const originalIndex=new Map(source.entries.map((entry,index)=>[entry.id,index]));
const ordered=[];

for(const sceneMeta of scenes){
  const rows=source.entries.filter(entry=>entry.sceneId===sceneMeta.id);
  const beforeSettings=new Map(),afterSettings=new Map(),deliveryBySpeech=new Map(),betweenByOrdinal=new Map();
  const append=(map,key,entry)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(entry)};
  for(const entry of rows){
    if(entry.kind==='scene-setting')append(entry.anchor?.type==='after'?afterSettings:beforeSettings,entry.anchor?.speechId,entry);
    else if(entry.placement==='delivery')append(deliveryBySpeech,entry.speechId,entry);
    else append(betweenByOrdinal,entry.sourceSpeakerOrdinal,entry);
  }
  const bySource=(a,b)=>(originalIndex.get(a.id)??0)-(originalIndex.get(b.id)??0);
  const bySetting=(a,b)=>(a.anchor?.order??0)-(b.anchor?.order??0)||bySource(a,b);
  for(let n=1;n<=sceneMeta.speeches;n+=1){
    const speechId=`${sceneMeta.id}-speech-${String(n).padStart(4,'0')}`;
    ordered.push(...(beforeSettings.get(speechId)||[]).sort(bySetting));
    ordered.push(...(deliveryBySpeech.get(speechId)||[]).sort(bySource));
    ordered.push(...(afterSettings.get(speechId)||[]).sort(bySetting));
    ordered.push(...(betweenByOrdinal.get(n)||[]).sort(bySource));
  }
  const sceneRows=ordered.filter(entry=>entry.sceneId===sceneMeta.id);
  if(sceneRows.length!==rows.length)throw new Error(`${sceneMeta.id}: ordered ${sceneRows.length}/${rows.length}`);
}

const counters=new Map();
const entries=ordered.map(entry=>{
  const sceneMeta=scenes.find(scene=>scene.id===entry.sceneId);
  const sourceOrder=(counters.get(entry.sceneId)||0)+1;counters.set(entry.sceneId,sourceOrder);
  const anchor=entry.kind==='scene-setting'
    ?{...entry.anchor}
    :{type:entry.placement,speechId:entry.speechId,order:sourceOrder};
  return{
    ...entry,
    act:sceneMeta.act,
    scene:sceneMeta.scene,
    sourceOrder,
    category:categoryFor(entry),
    anchor,
  };
});

const result={
  ...source,
  schemaVersion:2,
  policy:{
    ...source.policy,
    explicitSourceOrder:true,
    orderedScriptStream:true,
    stageDirectionsAreNotSpeeches:true,
  },
  entries,
};
const output=JSON.stringify(result,null,2)+'\n';
fs.writeFileSync(canonicalPath,output);
fs.writeFileSync(runtimePath,output);
console.log(JSON.stringify({
  status:'PASS',
  schemaVersion:result.schemaVersion,
  entries:entries.length,
  scenes:Object.fromEntries([...counters]),
  categories:Object.fromEntries([...entries.reduce((map,entry)=>map.set(entry.category,(map.get(entry.category)||0)+1),new Map())]),
},null,2));
