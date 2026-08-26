import fs from 'node:fs';
const path='app/src/data-store.js';
let text=fs.readFileSync(path,'utf8');
const bad="          if (parent.start > clause.start || parent.end < clause.end) throw new Error('structure.' + lineId + ': nested clause outside parent');\n";
if(!text.includes(bad))throw new Error('obsolete parent-span assumption not found');
text=text.replace(bad,'');
if(text.includes('nested clause outside parent'))throw new Error('obsolete parent-span assumption survived');
fs.writeFileSync(path,text);
console.log('Removed non-canonical parent-span containment assumption.');
