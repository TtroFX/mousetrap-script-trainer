import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
const cwd=process.cwd(),read=p=>fs.readFileSync(path.join(cwd,p),'utf8'),exists=p=>fs.existsSync(path.join(cwd,p)),fail=m=>{throw new Error(m)};
const syntaxCheck=p=>{const r=spawnSync(process.execPath,['--check',p],{cwd,encoding:'utf8'});if(r.status!==0)fail(`${p} syntax failed: ${r.stderr||r.stdout}`)};
const manifest=JSON.parse(read('manifest.webmanifest'));if(manifest.display!=='standalone')fail('manifest display must be standalone');
const version=JSON.parse(read('pwa-version.json'));if(version.schemaVersion!==1||!version.buildId||!version.dataVersion)fail('pwa-version invalid');
const expected=new Set(['mousetrap_script_data.json','mousetrap_line_translations.json','mousetrap_line_vocabulary.json','mousetrap_line_grammar.json','mousetrap_word_dictionary.json']);
if(!Array.isArray(version.canonicalDataFiles)||version.canonicalDataFiles.length!==5)fail('canonical data contract must contain five files');for(const f of version.canonicalDataFiles){if(!expected.delete(f.path)||!/^[0-9a-f]{64}$/.test(f.sha256))fail(`bad canonical entry ${f.path}`)}if(expected.size)fail('canonical data contract incomplete');
const required=['index.html','p5.css','p5_app.js','reader_sheet.js','p6_private_data.js','p6_pwa.js','P2_learning.html','008_cue_practice_P3.html','009_rehearsal_P4.html','sw.js','scripts/assemble-production.mjs'];for(const f of required)if(!exists(f))fail(`missing ${f}`);
const html=read('index.html');for(const t of ['id="learningOverlay"','id="wordOverlay"','src="reader_sheet.js"','src="p6_pwa.js"'])if(!html.includes(t))fail(`index missing ${t}`);
const sw=read('sw.js');new vm.Script(sw,{filename:'sw.js'});for(const t of [version.buildId,version.dataVersion,'atomicInstall','warmCanonicalData','DATA_HASH_MISMATCH','OFFLINE_DATA_MISSING','SKIP_WAITING','reader_sheet.js'])if(!sw.includes(t))fail(`sw missing ${t}`);
const p5=read('p5_app.js');new vm.Script(p5,{filename:'p5_app.js'});for(const t of ['MTS_SHARED_LINE_ANNOTATIONS','MTS_SHARED_WORD_DICTIONARY','mts.reader.progress','mts.practice.cue.ratings','mts.practice.rehearsal.state'])if(!p5.includes(t))fail(`p5 missing ${t}`);
syntaxCheck('reader_sheet.js');const sheet=read('reader_sheet.js');for(const t of ['reader-vocab','wordOverlay','wordSheet','MTS_SHARED_LINE_ANNOTATIONS','MTS_SHARED_WORD_DICTIONARY','MTS_STUDY_ANYWHERE','openLineOnText','DOC_META','studyFingerprint===fingerprint','practiceTheme','Word dictionary','In this line'])if(!sheet.includes(t))fail(`Study layer missing ${t}`);
for(const legacy of ['learningSheetHandle','learningSheetClose','MTS_READER_SHEET'])if(sheet.includes(legacy))fail(`legacy Reader sheet behavior remains: ${legacy}`);
if(/reader-vocab[^`]*background:linear-gradient/i.test(sheet))fail('vocabulary highlight background remains');
if(!sheet.includes('background:none!important'))fail('underline-only vocabulary style missing');
const dictMarkup=sheet.indexOf('<section class="word-dict-card"'),contextMarkup=sheet.indexOf('<section class="word-context-card"');if(dictMarkup<0||contextMarkup<0||dictMarkup>contextMarkup)fail('dictionary must render before sentence context');
const zeroVocabGuard='if(el.dataset.studyFingerprint===fingerprint)return true';if(!sheet.includes(zeroVocabGuard))fail('zero-vocabulary mutation-loop guard missing');
for(const f of ['008_cue_practice_P3.html','009_rehearsal_P4.html']){const s=read(f);if(!s.includes('src="p6_private_data.js"')||!s.includes('getVerifiedResponse'))fail(`${f} verified resolver missing`)}
const learning=read('P2_learning.html');for(const t of ['translationSource','Grammar / Usage','Dictionary entryが見つかりません'])if(!learning.includes(t))fail(`Learning UI missing ${t}`);
syntaxCheck('scripts/assemble-production.mjs');const assembler=read('scripts/assemble-production.mjs');for(const t of ['--verify-only','SHA-256 mismatch','1186','692','578'])if(!assembler.includes(t))fail(`assembler missing ${t}`);
const runtime=['index.html','p5_app.js','reader_sheet.js','p6_private_data.js','p6_pwa.js','P2_learning.html','008_cue_practice_P3.html','009_rehearsal_P4.html','sw.js'],unresolved=/\b(?:TODO|FIXME|coming soon|not implemented|placeholder|dummy|fake|temporary)\b/i;for(const f of runtime){const s=read(f).replace(/\bplaceholder\s*=\s*(["']).*?\1/gi,'');if(unresolved.test(s))fail(`blocking marker in ${f}`)}
console.log(JSON.stringify({status:'PASS',buildId:version.buildId,canonicalContract:5,readerSyntax:true,underlineOnlyVocabulary:true,dictionaryBeforeSentence:true,practiceMutationLoopGuard:true,practiceUnifiedTheme:true,studyAcrossModes:true,serviceWorkerSyntax:true,blockingMarkers:0},null,2));
