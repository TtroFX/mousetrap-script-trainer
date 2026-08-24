import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const cwd=process.cwd();
const read=p=>fs.readFileSync(path.join(cwd,p),'utf8');
const exists=p=>fs.existsSync(path.join(cwd,p));
const fail=m=>{throw new Error(m)};
const manifest=JSON.parse(read('manifest.webmanifest'));
for(const key of ['name','short_name','start_url','scope','display','background_color','theme_color','icons']) if(!manifest[key]) fail(`manifest missing ${key}`);
if(manifest.display!=='standalone') fail('manifest display must be standalone');
for(const icon of manifest.icons){if(!icon.src||!exists(icon.src))fail(`missing icon ${icon.src||'(empty)'}`)}
const version=JSON.parse(read('pwa-version.json'));
if(version.schemaVersion!==1||!version.buildId||!version.dataVersion)fail('pwa-version invalid');
if(!Array.isArray(version.canonicalDataFiles)||version.canonicalDataFiles.length!==5)fail('canonical data contract must contain five files');
const expected=new Set(['mousetrap_script_data.json','mousetrap_line_translations.json','mousetrap_line_vocabulary.json','mousetrap_line_grammar.json','mousetrap_word_dictionary.json']);
for(const f of version.canonicalDataFiles){if(!expected.delete(f.path))fail(`unexpected/duplicate canonical path ${f.path}`);if(!/^[0-9a-f]{64}$/.test(f.sha256))fail(`bad sha256 ${f.path}`)}
if(expected.size)fail(`missing canonical paths ${[...expected].join(',')}`);
const html=read('index.html');
for(const fragment of ['rel="manifest" href="manifest.webmanifest"','name="viewport"','name="theme-color"','src="p5_app.js"','src="p6_pwa.js"']) if(!html.includes(fragment))fail(`index missing ${fragment}`);
if(/https?:\/\/|cdn\./i.test(html))fail('index contains external runtime dependency');
for(const required of ['index.html','p5.css','p5_app.js','p6_pwa.css','p6_pwa.js','P2_learning.html','008_cue_practice_P3.html','009_rehearsal_P4.html','manifest.webmanifest','pwa-version.json','offline.html','sw.js']) if(!exists(required))fail(`missing required asset ${required}`);
const sw=read('sw.js');new vm.Script(sw,{filename:'sw.js'});
for(const token of ['install','activate','fetch','CACHE_PREFIX','DATA_VERSION','SKIP_WAITING','OFFLINE_DATA_MISSING','DATA_HASH_MISMATCH']) if(!sw.includes(token))fail(`sw missing ${token}`);
const p5=read('p5_app.js');
for(const token of ["['act1-scene1','act1-scene1-speech-',190","['act1-scene2','act1-scene2-speech-',336","['act2','act2-speech-',638","mousetrap_script_data.json","mousetrap_line_translations.json","mousetrap_line_vocabulary.json","mousetrap_line_grammar.json","mousetrap_word_dictionary.json"]) if(!p5.includes(token))fail(`P5 canonical invariant missing ${token}`);
if(p5.includes('prototypeData')||p5.includes('embeddedPrototype'))fail('prototype dependency detected');
console.log(JSON.stringify({status:'PASS',manifest:true,serviceWorkerSyntax:true,canonicalContract:5,p5CanonicalInvariants:true,externalRuntimeDependencies:0},null,2));
