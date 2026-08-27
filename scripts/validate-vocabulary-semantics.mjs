import fs from 'node:fs';
const fail=m=>{throw new Error(m)};
const dict=JSON.parse(fs.readFileSync('mousetrap_word_dictionary.json','utf8'));
const vocab=JSON.parse(fs.readFileSync('mousetrap_line_vocabulary.json','utf8'));
const map=new Map(Object.entries(dict).map(([k,v])=>[k.trim().toLowerCase(),v]));
let items=0,ctx=0;
for(const [k,d] of Object.entries(dict)){if(!String(d.meaning||'').trim())fail('missing meaning '+k);if(String(d.meaning).trim()!==String(d.coreMeaning||'').trim())fail('core mismatch '+k);if('contextMeaning' in d||'contextExplanation' in d)fail('play context leaked into dictionary '+k);}
for(const [line,rows] of Object.entries(vocab)){if(!Array.isArray(rows))fail('rows '+line);for(const e of rows){items++;const d=map.get(String(e.lemma||'').trim().toLowerCase());if(!d)fail('missing lemma '+e.lemma);if(String(e.meaning||'').trim()!==String(d.meaning||'').trim())fail('meaning mismatch '+line+' '+e.lemma);if('inThisPlay' in e){const t=String(e.inThisPlay||'').trim();if(typeof e.inThisPlay!=='string'||!t||t.length>360||t===String(e.meaning||'').trim())fail('invalid inThisPlay '+line+' '+e.lemma);ctx++;}}}
console.log(JSON.stringify({status:'PASS',dictionary:Object.keys(dict).length,vocabularyItems:items,inThisPlay:ctx},null,2));
