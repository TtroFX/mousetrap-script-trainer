import fs from 'node:fs';

const rows=[];
const add=(source,id,text)=>{const value=String(text||'').trim();if(!value)return;const words=[...value.matchAll(/[A-Za-z][A-Za-z'’-]*/g)].map(m=>m[0]);if(words.length)rows.push({source,id,words:[...new Set(words)],text:value});};

const translations=JSON.parse(fs.readFileSync('mousetrap_line_translations.json','utf8'));
for(const [id,entry] of Object.entries(translations))add('translation',id,entry?.translation);
for(const scene of ['act1-scene1','act1-scene2','act2']){
  const data=JSON.parse(fs.readFileSync(`data/interpretation/${scene}.json`,'utf8'));
  for(const [id,notes] of Object.entries(data.interpretations||{}))for(const note of notes||[])add('interpretation',`${id}:${note.kind}`,note.text);
}

const freq=new Map();
for(const row of rows)for(const word of row.words)freq.set(word,(freq.get(word)||0)+1);
console.log('=== ASCII WORD FREQUENCY ===');
for(const [word,count] of [...freq].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])))console.log(`${String(count).padStart(4)}  ${word}`);
console.log('\n=== OCCURRENCES ===');
for(const row of rows)console.log(`${row.source}\t${row.id}\t[${row.words.join(', ')}]\t${row.text}`);
console.log(`\nrowsWithAscii=${rows.length} uniqueWords=${freq.size}`);
