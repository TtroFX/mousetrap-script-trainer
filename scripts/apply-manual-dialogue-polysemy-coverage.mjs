import fs from 'node:fs';
import crypto from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')); const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); const key=v=>String(v??'').normalize('NFKC').replace(/[’‘]/g,"'").trim().toLowerCase();
const D='mousetrap_word_dictionary.json',V='mousetrap_line_vocabulary.json',C='data/canonical-production-contract.json',M='data/canonical-integration-manifest.json';
const dict=read(D),vocab=read(V); const dkey=new Map(Object.keys(dict).map(k=>[key(k),k]));
const showKey=dkey.get('show'),followKey=dkey.get('follow'); if(!showKey||!followKey)throw new Error('show/follow dictionary entries missing');
const showMeaning='【動】\n① ～を見せる、示す。\n② 性質・状態・感情などが表れる、見える。\n【名】\n見せ物、ショー、上演。';
const followMeaning='【動】\n① ～の後について行く、追う。\n② ～に続く。\n③ ～を理解する。\n④ 指示・助言・規則などに従う。';
for(const [k,meaning] of [[showKey,showMeaning],[followKey,followMeaning]]){dict[k].meaning=meaning;dict[k].coreMeaning=meaning;}
if(!dkey.has('as follows')){
  dict['as follows']={lemma:'as follows',ipa:'/əz ˈfɒləʊz/',pos:'定型表現',coreMeaning:'【定型表現】\n次のとおり、以下のとおり。',forms:'定型表現として用いる。',tags:['chunk'],meaning:'【定型表現】\n次のとおり、以下のとおり。'};
  dkey.set('as follows','as follows');
}
for(const rows of Object.values(vocab))for(const item of rows||[]){const dk=dkey.get(key(item.lemma));if(dk&&(dk===showKey||dk===followKey))item.meaning=dict[dk].meaning;}
let added=0;
const add=(speechId,surface,lemma,ctx)=>{const dk=dkey.get(key(lemma));if(!dk)throw new Error(`dictionary missing ${lemma}`);const rows=vocab[speechId]||=([]);if(rows.some(x=>key(x.surface)===key(surface)&&key(x.lemma)===key(dk)))return;rows.push({surface,lemma:dk,meaning:dict[dk].meaning,playMeaning:true,inThisPlay:ctx});added++;};
const BEGIN='ここでは「びくっとする」ではなく、「始める／始まる」の意味。';
add('act1-scene1-speech-0109','starting','start',BEGIN);
add('act1-scene2-speech-0001','starting','start','ここでは宿の営業を「始める」という意味で、驚いてびくっとする意味ではない。');
add('act1-scene2-speech-0093','started','start','ここではこのゲストハウスの営業を「始めた」という意味。');
add('act2-speech-0618','started','start','ここでは雪が「解け始めた」という意味で、びくっとする意味ではない。');
for(const sid of ['act1-scene1-speech-0110','act1-scene2-speech-0001','act1-scene2-speech-0229']) add(sid,'consider','consider','ここでは「検討する」よりも、ある事柄を「～だと考える／みなす」という意味。');
add('act1-scene1-speech-0156','Show','show','ここでは場所を相手に示し、案内する意味。');
for(const sid of ['act2-speech-0134','act2-speech-0135']) add(sid,'show','show','ここでは「見せる」ではなく、異常や性質が外見に「表れる／見て分かる」という意味。');
add('act2-speech-0558','show','show','show you the way で「道を示す／案内する」という意味。');
add('act1-scene1-speech-0187','faces','face','ここでは部屋が北の方を「向いている／北に面している」という動詞。');
for(const [sid,surface] of [['act1-scene2-speech-0244','faces'],['act1-scene2-speech-0324','face'],['act2-speech-0132','face'],['act2-speech-0140','face'],['act2-speech-0243','faces'],['act2-speech-0381','face'],['act1-scene2-speech-0263','face']]) add(sid,surface,'face','ここでは動詞ではなく、人の「顔」を表す名詞。');
add('act1-scene2-speech-0290','face','face','ここでは相手・問題から目をそらさず「向き合う／直面する」という動詞の意味。');
add('act1-scene2-speech-0085','follow','follow','follow his instructions で「彼の指示に従う」という意味。');
add('act1-scene2-speech-0226','following','follow','ここでは人物の後をつけて「尾行する／追跡する」に近い意味。');
add('act2-speech-0517','as follows','as follows','発言内容を列挙する前の定型表現で「次のとおり」の意味。');
add('act2-speech-0558','follow','follow','ここでは電話線に沿ってたどる、という意味。');
add('act1-scene2-speech-0233','stationed','station','ここでは軍人がEdinburghに「配属・駐屯していた」という動詞の意味。');
add('act2-speech-0052','haunting','haunt','ここでは幽霊が出るという意味ではなく、旋律が忘れにくく心に残る、という形容詞的な用法。');
add('act2-speech-0318','moved','move','ここでは物の位置を変える、別の場所へ移動させる意味。');
write(D,dict);write(V,vocab);
const ds=sha(D),vs=sha(V);const contract=read(C);for(const f of contract.files||[]){if(f.path===D)f.sha256=ds;if(f.path===V)f.sha256=vs;}write(C,contract);
const manifest=read(M);if(manifest.studyAssets?.wordDictionary){manifest.studyAssets.wordDictionary.sha256=ds;manifest.studyAssets.wordDictionary.entries=Object.keys(dict).length;}if(manifest.studyAssets?.lineVocabulary){manifest.studyAssets.lineVocabulary.sha256=vs;manifest.studyAssets.lineVocabulary.items=Object.values(vocab).reduce((n,r)=>n+(r?.length||0),0);manifest.studyAssets.lineVocabulary.annotatedSpeeches=Object.values(vocab).filter(r=>r?.length).length;}write(M,manifest);
const report={schemaVersion:2,status:'APPLIED',addedItems:added,dictionaryEntries:Object.keys(dict).length,vocabularyItems:Object.values(vocab).reduce((n,r)=>n+(r?.length||0),0),dictionaryChanges:['show','follow','as follows'],falsePositiveMorphologyDeferred:['act1-scene1-speech-0100|Rose','act1-scene1-speech-0101|Rose'],sha256:{dictionary:ds,vocabulary:vs}};write('data/vocabulary-full-coverage-polysemy-manual-repair.json',report);console.log(JSON.stringify(report,null,2));
