import fs from 'node:fs';

const personWords=new Set([
  'Mollie','Trotter','Mrs','Boyle','Georgie','Casewell','Giles','Christopher','Metcalf','Paravicini',
  'Major','Jimmy','Kathy','Stanning','Wren','Maureen','Hogben','Corrigan','Ralston','Katherine','Robin',
  'Sir','John','Waring','Chris','Lyon'
]);
const spellingExceptions=new Map([
  ['translation:act1-scene1-speech-0024',new Set(['S','Monkswell','Monkwell'])],
  ['translation:act1-scene1-speech-0025',new Set(['Monkwell'])],
  ['translation:act1-scene2-speech-0179',new Set(['W'])],
  ['translation:act2-speech-0435',new Set(['K'])],
  ['interpretation:act1-scene1-speech-0024:reaction',new Set(['S','Monkswell','Monkwell'])],
  ['interpretation:act1-scene1-speech-0025:tone',new Set(['Monkwell'])],
  ['interpretation:act2-speech-0435:context',new Set(['K'])]
]);

const violations=[];
const normalize=word=>word.replace(/[’']s$/i,'');
function inspect(source,id,text){
  const value=String(text||'').trim();
  if(!value)return;
  const key=`${source}:${id}`;
  const exceptions=spellingExceptions.get(key)||new Set();
  for(const match of value.matchAll(/[A-Za-z][A-Za-z'’-]*/g)){
    const raw=match[0],word=normalize(raw);
    if(personWords.has(word)||exceptions.has(raw)||exceptions.has(word))continue;
    violations.push({source,id,word:raw,text:value});
  }
}

const translations=JSON.parse(fs.readFileSync('mousetrap_line_translations.json','utf8'));
for(const [id,entry] of Object.entries(translations))inspect('translation',id,entry?.translation);
for(const scene of ['act1-scene1','act1-scene2','act2']){
  const data=JSON.parse(fs.readFileSync(`data/interpretation/${scene}.json`,'utf8'));
  for(const [id,notes] of Object.entries(data.interpretations||{}))for(const note of notes||[])inspect('interpretation',`${id}:${note.kind}`,note.text);
}

if(violations.length){
  console.error(`Japanese prose audit FAIL: ${violations.length} untranslated ASCII token occurrence(s).`);
  for(const row of violations)console.error(`${row.source}\t${row.id}\t${row.word}\t${row.text}`);
  process.exit(1);
}
console.log('Japanese prose audit PASS: no accidental non-name English remains in Translation/Interpretation.');
