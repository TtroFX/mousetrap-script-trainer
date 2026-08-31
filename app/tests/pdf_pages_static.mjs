import { pageForLine } from '../src/pdf-pages.js';

const fail=message=>{throw new Error(message)};
const scenes=Object.freeze({
  'act1-scene1':190,
  'act1-scene2':336,
  'act2':638,
});
const anchors=Object.freeze({
  'act1-scene1-speech-0001':2,
  'act1-scene1-speech-0002':2,
  'act1-scene1-speech-0003':3,
  'act1-scene1-speech-0187':18,
  'act1-scene1-speech-0190':18,
  'act1-scene2-speech-0001':19,
  'act1-scene2-speech-0014':20,
  'act1-scene2-speech-0336':42,
  'act2-speech-0001':43,
  'act2-speech-0013':44,
  'act2-speech-0628':83,
  'act2-speech-0638':83,
});

let total=0;
for(const [sceneId,count] of Object.entries(scenes)){
  let previous=0;
  for(let ordinal=1;ordinal<=count;ordinal++){
    const lineId=`${sceneId}-speech-${String(ordinal).padStart(4,'0')}`;
    const page=pageForLine(lineId);
    if(!Number.isInteger(page))fail(`${lineId}: pageForLine must return an integer, got ${page}`);
    if(page<2||page>83)fail(`${lineId}: displayed script page out of range: ${page}`);
    if(page<previous)fail(`${lineId}: script page regressed ${previous} -> ${page}`);
    previous=page;
    total++;
  }
}
if(total!==1164)fail(`speech coverage ${total}/1164`);
for(const [lineId,expected] of Object.entries(anchors)){
  const actual=pageForLine(lineId);
  if(actual!==expected)fail(`${lineId}: expected p.${expected}, got p.${actual}`);
}
for(const invalid of ['',null,undefined,'act1-scene1-speech-0000','act1-scene3-speech-0001','act2-speech-nope']){
  if(pageForLine(invalid)!==null)fail(`invalid line id must return null: ${String(invalid)}`);
}

console.log(JSON.stringify({
  status:'PASS',
  scenes,
  speeches:total,
  nullPages:0,
  displayedScriptPages:82,
  anchors:Object.keys(anchors).length,
},null,2));
