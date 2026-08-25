import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';

const cwd=process.cwd();
const read=p=>fs.readFileSync(path.join(cwd,p),'utf8');
const exists=p=>fs.existsSync(path.join(cwd,p));
const fail=m=>{throw new Error(m)};
const pngDimensions=p=>{const b=fs.readFileSync(path.join(cwd,p));if(b.length<24||b.toString('hex',0,8)!=='89504e470d0a1a0a')fail(`invalid PNG ${p}`);return[b.readUInt32BE(16),b.readUInt32BE(20)]};
const syntaxCheck=p=>{const r=spawnSync(process.execPath,['--check',p],{cwd,encoding:'utf8'});if(r.status!==0)fail(`${p} syntax failed: ${r.stderr||r.stdout}`)};

const manifest=JSON.parse(read('manifest.webmanifest'));
for(const key of ['name','short_name','start_url','scope','display','background_color','theme_color','icons'])if(!manifest[key])fail(`manifest missing ${key}`);
if(manifest.display!=='standalone')fail('manifest display must be standalone');
const declared=new Map(manifest.icons.map(icon=>[icon.src,icon]));
for(const [src,size] of [['icons/icon-192.png',192],['icons/icon-512.png',512],['icons/icon-maskable-512.png',512]]){
  const icon=declared.get(src);if(!icon)fail(`manifest missing icon ${src}`);if(!exists(src))fail(`missing icon ${src}`);
  const [w,h]=pngDimensions(src);if(w!==size||h!==size)fail(`icon dimensions ${src}: ${w}x${h}, expected ${size}x${size}`);
}
if(!String(declared.get('icons/icon-maskable-512.png')?.purpose||'').split(/\s+/).includes('maskable'))fail('maskable icon purpose missing');

const version=JSON.parse(read('pwa-version.json'));
if(version.schemaVersion!==1||!String(version.buildId||'')||!String(version.dataVersion||''))fail('pwa-version invalid');
if(!Array.isArray(version.canonicalDataFiles)||version.canonicalDataFiles.length!==5)fail('canonical data contract must contain five files');
const expected=new Set(['mousetrap_script_data.json','mousetrap_line_translations.json','mousetrap_line_vocabulary.json','mousetrap_line_grammar.json','mousetrap_word_dictionary.json']);
for(const f of version.canonicalDataFiles){if(!expected.delete(f.path))fail(`unexpected/duplicate canonical path ${f.path}`);if(!/^[0-9a-f]{64}$/.test(f.sha256))fail(`bad sha256 ${f.path}`)}
if(expected.size)fail(`missing canonical paths ${[...expected].join(',')}`);

const html=read('index.html');
for(const fragment of ['rel="manifest" href="manifest.webmanifest"','name="viewport"','name="theme-color"','src="p6_private_data.js"','src="p5_app.js"','src="p6_pwa.js"','id="retryBtn"'])if(!html.includes(fragment))fail(`index missing ${fragment}`);
for(const forbidden of ['id="importDataBtn"','id="privateDataFiles"','Import private production data'])if(html.includes(forbidden))fail(`manual production-data path remains: ${forbidden}`);
if(/https?:\/\/|cdn\./i.test(html))fail('index contains external runtime dependency');

const required=['index.html','p5.css','p5_app.js','p6_private_data.js','p6_pwa.css','p6_pwa.js','P2_learning.html','008_cue_practice_P3.html','009_rehearsal_P4.html','manifest.webmanifest','pwa-version.json','offline.html','sw.js','scripts/assemble-production.mjs'];
for(const file of required)if(!exists(file))fail(`missing required asset ${file}`);

const sw=read('sw.js');new vm.Script(sw,{filename:'sw.js'});
for(const token of [version.buildId,version.dataVersion,'install','activate','fetch','CACHE_PREFIX','DATA_CACHE','DATA_VERSION','atomicInstall','warmCanonicalData','SKIP_WAITING','OFFLINE_DATA_MISSING','DATA_HASH_MISMATCH','LEGACY_PRIVATE_CACHE'])if(!sw.includes(token))fail(`sw missing ${token}`);
if(sw.includes("const PRIVATE_CACHE='mts-private-production-v1'"))fail('legacy private cache is still a production data source');

const resolver=read('p6_private_data.js');new vm.Script(resolver,{filename:'p6_private_data.js'});
for(const token of ['version:3','nativeFetch','guardedFetch','UNVERIFIED_CANONICAL_FETCH_BLOCKED','getVerifiedResponse','prepare','validateAll','DATA_HASH_MISMATCH','PRODUCTION_DATA_UNAVAILABLE','mts-pwa-data-','1186','692','578'])if(!resolver.includes(token))fail(`production data resolver missing ${token}`);
for(const forbidden of ['FileReader','privateDataFiles','accept="application/json','install(import'])if(resolver.includes(forbidden))fail(`manual/import production fallback remains: ${forbidden}`);

const p5=read('p5_app.js');new vm.Script(p5,{filename:'p5_app.js'});
for(const token of ["['act1-scene1','act1-scene1-speech-',190","['act1-scene2','act1-scene2-speech-',336","['act2','act2-speech-',638","mousetrap_script_data.json","mousetrap_line_translations.json","mousetrap_line_vocabulary.json","mousetrap_line_grammar.json","mousetrap_word_dictionary.json","mts.reader.progress","data-reader-mode","#/search","mts.practice.cue.ratings","mts.practice.rehearsal.state","showDataFailure","verified production response unavailable"])if(!p5.includes(token))fail(`P5 production invariant missing ${token}`);
for(const forbidden of ['prototypeData','embeddedPrototype','importDataBtn','privateDataFiles','MTS_PRIVATE_DATA.install','Private production JSONをImport'])if(p5.includes(forbidden))fail(`dead/non-production P5 path remains: ${forbidden}`);

const learning=read('P2_learning.html');
for(const token of ['src="p6_private_data.js"','getVerifiedResponse','FAIL-CLOSED · PRODUCTION DATA UNAVAILABLE','translationSource','Headword','contextMeaning','Grammar / Usage','#/rehearsal?scene=','Dictionary entryが見つかりません','このspeechには登録Vocabularyがありません','このspeechには追加Grammar noteがありません'])if(!learning.includes(token))fail(`Learning UI missing ${token}`);
const cue=read('008_cue_practice_P3.html');
for(const token of ['src="p6_private_data.js"','getVerifiedResponse','FAIL-CLOSED · PRODUCTION DATA UNAVAILABLE','mousetrap_script_data.json','mts.practice.cue.ratings','mts.practice.pending'])if(!cue.includes(token))fail(`Cue Practice invariant missing ${token}`);
const rehearsal=read('009_rehearsal_P4.html');
for(const token of ['src="p6_private_data.js"','getVerifiedResponse','FAIL-CLOSED · PRODUCTION DATA UNAVAILABLE','id="skipBtn"','id="replayBtn"','function skip()','function replay()','mts.practice.rehearsal.state','SpeechRecognition','speechSynthesis'])if(!rehearsal.includes(token))fail(`Rehearsal production control missing ${token}`);
for(const [name,source] of [['P2_learning.html',learning],['008_cue_practice_P3.html',cue],['009_rehearsal_P4.html',rehearsal]]){
  if(/fetch\s*\(\s*['"]mousetrap_[^'"]+\.json/i.test(source))fail(`unverified canonical direct fetch remains in ${name}`);
}

syntaxCheck('scripts/assemble-production.mjs');
const assembler=read('scripts/assemble-production.mjs');
for(const token of ['--verify-only','MTS_PRODUCTION_DATA_DIR','SHA-256 mismatch','1186','692','578','production-bundle.json'])if(!assembler.includes(token))fail(`production assembler missing ${token}`);
const pkg=JSON.parse(read('package.json'));
if(pkg.scripts?.['verify:production']!=='node scripts/assemble-production.mjs --verify-only')fail('verify:production script missing');
if(pkg.scripts?.['assemble:production']!=='node scripts/assemble-production.mjs')fail('assemble:production script missing');

const productionRuntime=['index.html','p5_app.js','p6_private_data.js','p6_pwa.js','P2_learning.html','008_cue_practice_P3.html','009_rehearsal_P4.html','sw.js'];
const unresolved=/\b(?:TODO|FIXME|coming soon|not implemented|placeholder|dummy|fake|temporary)\b/i;
for(const file of productionRuntime){
  const source=read(file).replace(/\bplaceholder\s*=\s*(["']).*?\1/gi,'');
  if(unresolved.test(source))fail(`blocking placeholder marker in ${file}`);
}

console.log(JSON.stringify({
  status:'PASS',
  buildId:version.buildId,
  manifest:true,
  iconDimensions:true,
  serviceWorkerSyntax:true,
  atomicOfflineInstall:true,
  automaticProductionDataResolver:true,
  unverifiedCanonicalFetchBlocked:true,
  childVerifiedResolver:true,
  manualImportPath:false,
  canonicalContract:5,
  productionAssembler:true,
  p5ProductionInvariants:true,
  externalRuntimeDependencies:0,
  blockingPlaceholderMarkers:0
},null,2));
