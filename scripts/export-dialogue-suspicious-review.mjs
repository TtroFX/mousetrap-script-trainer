import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const focus=read('data/vocabulary-full-coverage-review-focus.json');
const rows=(focus.suspiciousUnknowns||[]).map(x=>({token:x.token,count:x.count,speechIds:[...new Set((x.examples||[]).map(e=>e.speechId))]}));
const lines=['token\tcount\tspeechIds',...rows.map(x=>`${x.token}\t${x.count}\t${x.speechIds.join(',')}`)];
fs.writeFileSync('data/vocabulary-full-coverage-suspicious-review.tsv',lines.join('\n')+'\n');
fs.writeFileSync('data/vocabulary-full-coverage-suspicious-review.json',JSON.stringify({schemaVersion:1,status:'REVIEW_REQUIRED',count:rows.length,rows},null,2)+'\n');
console.log(lines.join('\n'));
