import fs from 'node:fs';
const path='scripts/audit-vocabulary-full-coverage.mjs';
const before=fs.readFileSync(path,'utf8');
const needle="forgiven:'give'";
if(!before.includes(needle)){
  if(before.includes("forgiven:'forgive'")){console.log('Already fixed.');process.exit(0);}
  throw new Error('Expected forgiven morphology mapping not found');
}
const after=before.replace(needle,"forgiven:'forgive'");
if(after===before)throw new Error('No replacement made');
fs.writeFileSync(path,after);
console.log('Fixed forgiven -> forgive morphology mapping.');
