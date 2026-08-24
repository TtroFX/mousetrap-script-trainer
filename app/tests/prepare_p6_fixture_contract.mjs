import fs from 'node:fs';
import crypto from 'node:crypto';
const file='pwa-version.json';
const version=JSON.parse(fs.readFileSync(file,'utf8'));
for(const item of version.canonicalDataFiles){const bytes=fs.readFileSync(item.path);item.sha256=crypto.createHash('sha256').update(bytes).digest('hex')}
version.fixtureMode='synthetic-structural-ci-only';
fs.writeFileSync(file,JSON.stringify(version,null,2)+'\n');
console.log('Updated pwa-version.json hashes for synthetic CI fixture only.');
