import fs from 'node:fs';

const files=['data/interpretation/act1-scene1.json','data/interpretation/act1-scene2.json','data/interpretation/act2.json'];
const replacements=[
  ['chicken netting','鶏小屋用の金網'],
  ['Twerp!','ばか！'],
  ['bridge','ブリッジ'],
  ['Detective 巡査部長','刑事巡査部長'],
  ['funny','おかしい'],
  ['sleuth','探偵'],
  ['they say','世間ではそう言う'],
  ['it’s you','あなたね'],
  ["it's you",'あなたね'],
  ['犯人’s idea','犯人の思いつき'],
  ["犯人's idea",'犯人の思いつき'],
  ['we found','私たちが見つけた'],
  ['could be','そうかもしれない'],
  ['cupboard','戸棚'],
  ['bus ticket','バスの乗車券'],
  ['「都合よく（都合よく）」を「in都合よく（不都合に）」へ','「都合よく」を「不都合に」へ'],
  ['in都合よく','不都合に'],
  ['We 警察官','私たち警察官']
];
let changed=0;
for(const file of files){
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const notes of Object.values(data.interpretations||{}))for(const note of notes||[]){
    const before=String(note.text||'');
    let after=before;
    for(const [from,to] of replacements)after=after.replaceAll(from,to);
    if(after!==before){note.text=after;changed++;}
  }
  fs.writeFileSync(file,JSON.stringify(data)+'\n');
}
console.log(JSON.stringify({status:'RESIDUAL_FIXED',changed},null,2));
