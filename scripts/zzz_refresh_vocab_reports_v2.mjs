import fs from 'node:fs';
import crypto from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const vocab=read('mousetrap_line_vocabulary.json');
const dict=read('mousetrap_word_dictionary.json');
let items=0,inThisPlayItems=0,mismatches=0;
const examples=[];
const byLemma=new Map(Object.entries(dict).map(([k,v])=>[k.trim().toLowerCase(),v]));
for(const [speechId,rows] of Object.entries(vocab))for(const e of rows){items++;const d=byLemma.get(String(e.lemma||'').trim().toLowerCase());if(!d||String(e.meaning||'').trim()!==String(d.meaning||'').trim())mismatches++;if(e.inThisPlay){inThisPlayItems++;if(examples.length<12)examples.push({speechId,surface:e.surface,lemma:e.lemma,meaning:e.meaning,inThisPlay:e.inThisPlay});}}
const dictPlayContextFields=Object.values(dict).reduce((n,e)=>n+('contextMeaning' in e?1:0)+('contextExplanation' in e?1:0),0);
const meaningCoreMismatches=Object.values(dict).filter(e=>String(e.meaning||'').trim()!==String(e.coreMeaning||'').trim()).length;
if(mismatches||dictPlayContextFields||meaningCoreMismatches)throw new Error(JSON.stringify({mismatches,dictPlayContextFields,meaningCoreMismatches}));
const previous=read('data/vocabulary-meaning-refinement-report.json');
write('data/vocabulary-meaning-refinement-report.json',{
  schemaVersion:4,
  status:'PASS',
  policy:{
    meaning:'Neutral Japanese dictionary translation. Single lexical items use dictionary-style part-of-speech headings and line breaks where the curated dictionary data supports them.',
    inThisPlay:'Optional occurrence-level field. Retained only for speaker intent, irony, joke, non-literal or pragmatic force, or a material departure from the ordinary dictionary reading; ordinary contextual restatements are omitted.',
    sourceOfTruth:'mousetrap_word_dictionary.json meaning is canonical for Meaning; mousetrap_line_vocabulary.json inThisPlay is canonical for occurrence-specific play meaning.',
    compatibility:'Existing playMeaning booleans are preserved because runtime uses them as a presentation filter.'
  },
  sources:previous.sources,
  dictionary:{entries:Object.keys(dict).length,playContextFields:dictPlayContextFields,meaningCoreMismatches,sha256:sha('mousetrap_word_dictionary.json')},
  vocabulary:{speeches:Object.keys(vocab).length,items,inThisPlayItems,meaningDictionaryMismatches:mismatches,sha256:sha('mousetrap_line_vocabulary.json')},
  uiContract:{meaning:'Meaning',optionalPlayMeaning:'In this play',legacyCoreContextRows:false,meaningLineBreaks:'pre-line'},
  examples
});
const expansion=read('data/vocabulary-context-expansion-report.json');
expansion.vocabulary.sha256=sha('mousetrap_line_vocabulary.json');
expansion.dictionary.sha256=sha('mousetrap_word_dictionary.json');
expansion.dictionary.presentation={patternFields:0,playContextFields:0,meaningCoreMismatches:0};
expansion.presentation.meaningPolicy='Dictionary-neutral Japanese translation; one-word entries use dictionary-style POS headings and line breaks.';
expansion.presentation.inThisPlayPolicy='Optional occurrence-level field; only speaker intent, irony/joke, non-literal/pragmatic force, or material departure from the ordinary dictionary reading is retained.';
expansion.presentation.inThisPlayItems=inThisPlayItems;
write('data/vocabulary-context-expansion-report.json',expansion);
console.log(JSON.stringify({status:'PASS',dictionary:Object.keys(dict).length,speeches:Object.keys(vocab).length,items,inThisPlayItems,dictSha:sha('mousetrap_word_dictionary.json'),vocabSha:sha('mousetrap_line_vocabulary.json')},null,2));
