import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const appDir=process.cwd(),rootDir=path.resolve(appDir,'..'),args=process.argv.slice(2);
const arg=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null};
const verifyOnly=args.includes('--verify-only');
const outDir=path.resolve(arg('--out-dir')||path.join(appDir,'dist'));
const fail=message=>{throw new Error(message)};
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const copy=(src,dst)=>{fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst)};
const copyDir=(src,dst)=>{for(const entry of fs.readdirSync(src,{withFileTypes:true})){const a=path.join(src,entry.name),b=path.join(dst,entry.name);entry.isDirectory()?copyDir(a,b):copy(a,b)}};

const version=readJson(path.join(appDir,'pwa-version.json'));
if(version.schemaVersion!==2||version.runtime!=='index-zero'||!String(version.buildId||''))fail('pwa-version invalid');
const contract=readJson(path.join(rootDir,'data/canonical-production-contract.json'));
if(contract.schemaVersion!==1||!Array.isArray(contract.files)||contract.files.length!==5)fail('canonical contract invalid');
for(const item of contract.files){const file=path.join(rootDir,item.path);if(!fs.existsSync(file))fail(`missing canonical ${item.path}`);if(sha(file)!==item.sha256)fail(`canonical SHA mismatch ${item.path}`)}

const scenes=[['act1-scene1',190],['act1-scene2',336],['act2',638]];
const scriptPath=path.join(rootDir,'mousetrap_script_data.json');
const script=readJson(scriptPath);
let speeches=0;for(const[id,count]of scenes){const rows=script[id]?.speeches;if(!Array.isArray(rows)||rows.length!==count)fail(`script ${id} count`);rows.forEach((row,i)=>{const expected=`${id}-speech-${String(i+1).padStart(4,'0')}`;if(row?.id!==expected||!row?.speaker||!row?.text)fail(`script ${id} #${i+1}`)});speeches+=rows.length}if(speeches!==1164)fail('script total');
const translations=readJson(path.join(rootDir,'mousetrap_line_translations.json')),vocabulary=readJson(path.join(rootDir,'mousetrap_line_vocabulary.json')),grammar=readJson(path.join(rootDir,'mousetrap_line_grammar.json')),dictionary=readJson(path.join(rootDir,'mousetrap_word_dictionary.json'));
if(Object.keys(translations).length!==1164||Object.keys(vocabulary).length!==1164||Object.keys(grammar).length!==1164||Object.keys(dictionary).length!==578)fail('canonical coverage counts invalid');
const vocabItems=Object.values(vocabulary).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0),grammarItems=Object.values(grammar).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0);if(vocabItems!==1186||grammarItems!==692)fail('annotation item counts invalid');
const dictionaryKeys=new Set(Object.keys(dictionary).map(x=>x.trim().toLowerCase()));for(const rows of Object.values(vocabulary))for(const entry of rows)if(!dictionaryKeys.has(String(entry.lemma||'').trim().toLowerCase()))fail(`missing dictionary lemma ${entry.lemma}`);

const structurePath=path.join(appDir,'mousetrap_line_structure.json');
if(!fs.existsSync(structurePath))fail('canonical chunking structure missing');
const structure=readJson(structurePath);
if(structure.schemaVersion!==2||structure.ruleSet!=='chunking-v1')fail('chunking-v1 structure schema required');
if('rawLines' in structure)fail('legacy structure fallback forbidden');
if(structure.sourceSha256!==sha(scriptPath))fail('structure/script SHA mismatch');
if(structure.counts?.speeches!==1164||structure.counts?.sentences!==2334||structure.counts?.clauses!==2939||structure.counts?.chunks!==11810)fail('chunking-v1 count contract invalid');
if(!structure.lines||Object.keys(structure.lines).length!==1164)fail('chunking-v1 speech coverage invalid');
const expectedIds=[];for(const[id,count]of scenes)for(let i=1;i<=count;i+=1)expectedIds.push(`${id}-speech-${String(i).padStart(4,'0')}`);if(Object.keys(structure.lines).some((id,i)=>id!==expectedIds[i]))fail('chunking-v1 speech order invalid');
for(const line of Object.values(structure.lines))for(const sentence of line.sentences||[])for(const chunk of sentence.chunks||[]){const marker=String(chunk.marker||'');if(marker.startsWith('Vi')||marker.startsWith('Vt')||marker.includes('VBN')||/^HV\d/.test(marker))fail(`legacy chunk marker ${marker}`)}

const required=['index.html','manifest.webmanifest','sw.js','offline.html','pwa-version.json'];for(const file of required)if(!fs.existsSync(path.join(appDir,file)))fail(`missing runtime ${file}`);for(const file of ['src/app.css','src/config.js','src/data-store.js','src/state-store.js','src/resume-bookmarks.js','src/gesture-controls.js','src/main.js'])if(!fs.existsSync(path.join(appDir,file)))fail(`missing module ${file}`);
const legacy=['p5_app.js','reader_sheet.js','practice_navigation.js','p6_private_data.js','p6_pwa.js','p6_pwa.css','P2_learning.html','008_cue_practice_P3.html','009_rehearsal_P4.html'];

if(!verifyOnly){
  fs.rmSync(outDir,{recursive:true,force:true});fs.mkdirSync(outDir,{recursive:true});
  for(const file of required)copy(path.join(appDir,file),path.join(outDir,file));
  copyDir(path.join(appDir,'src'),path.join(outDir,'src'));copyDir(path.join(appDir,'icons'),path.join(outDir,'icons'));
  copy(structurePath,path.join(outDir,'mousetrap_line_structure.json'));
  for(const item of contract.files){const src=path.join(rootDir,item.path),dst=path.join(outDir,item.path);copy(src,dst);if(sha(src)!==sha(dst))fail(`artifact SHA mismatch ${item.path}`)}
  for(const file of legacy)if(fs.existsSync(path.join(outDir,file)))fail(`legacy runtime leaked ${file}`);
  const files=Object.fromEntries(contract.files.map(item=>[item.path,sha(path.join(outDir,item.path))]));
  files['mousetrap_line_structure.json']=sha(path.join(outDir,'mousetrap_line_structure.json'));
  fs.writeFileSync(path.join(outDir,'production-bundle.json'),JSON.stringify({schemaVersion:2,buildId:version.buildId,runtime:'index-zero',verifiedAt:new Date().toISOString(),qa:{speeches:1164,translations:1164,vocabulary:vocabItems,grammar:grammarItems,dictionary:578,structureSentences:2334,structureClauses:2939,structureChunks:11810},files},null,2)+'\n');
}
console.log(JSON.stringify({status:'PASS',runtime:'index-zero',buildId:version.buildId,mode:verifyOnly?'verify-only':'assembled',qa:{speeches:1164,translations:1164,vocabulary:vocabItems,grammar:grammarItems,dictionary:578,structureSentences:2334,structureClauses:2939,structureChunks:11810}},null,2));
