import fs from 'node:fs';
const p='data/vocabulary-rebuild/block-5-oxford-review.json';
const r=JSON.parse(fs.readFileSync(p,'utf8'));
r.excludeWords ||= {};
r.excludeWords.racing = {reason:"The script has 'racing round the countryside' as the progressive form of verb race; Oxford B1 noun racing (the sport/activity) is not used."};
fs.writeFileSync(p,JSON.stringify(r,null,2)+'\n');
console.log(JSON.stringify({included:(r.includeLexemes||[]).length,excluded:Object.keys(r.excludeWords).length,racing:r.excludeWords.racing},null,2));
