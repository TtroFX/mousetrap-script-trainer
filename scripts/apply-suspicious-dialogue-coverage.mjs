import fs from 'node:fs';
import crypto from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const norm=v=>String(v??'').normalize('NFKC').replace(/[’‘]/g,"'").trim();
const key=v=>norm(v).toLowerCase();
const D='mousetrap_word_dictionary.json',V='mousetrap_line_vocabulary.json',A='data/vocabulary-full-coverage-audit.json';
const dict=read(D),vocab=read(V),audit=read(A),script=read('mousetrap_script_data.json');
const speechById=new Map(Object.values(script).flatMap(x=>x?.speeches||[]).map(x=>[x.id,x]));
const existing=new Map(Object.keys(dict).map(k=>[key(k),k]));

const specs={
'inconveniently':['副詞','【副】不便に、都合の悪い形で。'],'unfortunately':['副詞','【副】残念ながら、不運にも。'],'inconvenient':['形容詞','【形】不便な、都合の悪い。'],'deliciously':['副詞','【副】おいしく；非常に愉快に、魅力的に。'],'fortunately':['副詞','【副】幸運にも、ありがたいことに。'],'immediately':['副詞','【副】すぐに、直ちに。'],'possibility':['名詞','【名】可能性、あり得ること。'],'suggestion':['名詞','【名】提案；示唆、ほのめかし。'],'unfortunate':['形容詞','【形】不運な；残念な、好ましくない。'],'unhappiness':['名詞','【名】不幸、不満、悲しみ。'],'beforehand':['副詞','【副】前もって、あらかじめ。'],'completely':['副詞','【副】完全に、すっかり。'],'delightful':['形容詞','【形】とても楽しい、魅力的な。'],'direction':['名詞','【名】方向；指示、案内。'],'disgusting':['形容詞','【形】非常に不快な、嫌悪感を起こさせる。'],'enchanting':['形容詞','【形】とても魅力的な、うっとりさせる。'],'especially':['副詞','【副】特に、とりわけ。'],'everywhere':['副詞','【副】どこにでも、至る所に。'],'interested':['形容詞','【形】興味・関心を持っている。'],'particular':['形容詞','【形】特定の；特別な；細かい点にこだわる。'],'staircase':['名詞','【名】階段、階段部分。'],'suggest':['動詞','【動】提案する；示唆する、ほのめかす。'],'sweetheart':['名詞','【名】恋人、愛する人；親しい呼びかけ。'],'unpleasant':['形容詞','【形】不快な、嫌な。'],'advertisement':['名詞','【名】広告、宣伝。'],'downstairs':['副詞・形容詞・名詞','【副】階下へ、階下で。\n【形】階下の。\n【名】階下。'],'experience':['名詞・動詞','【名】経験、体験。\n【動】経験する。'],'throughout':['前置詞・副詞','【前】～の間ずっと、～の至る所で。\n【副】最初から最後まで、至る所に。'],'understand':['動詞','【動】理解する；～だと認識する、聞いている。'],'unfinished':['形容詞','【形】未完成の、終わっていない。'],'vegetable':['名詞','【名】野菜。'],'arrest':['動詞・名詞','【動】逮捕する。\n【名】逮捕。'],'brilliant':['形容詞','【形】非常に優れた、すばらしい；輝くように明るい。'],'cigarette':['名詞','【名】紙巻きたばこ。'],'complete':['動詞・形容詞','【動】完成させる、完了する；不足を補って完全にする。\n【形】完全な、全部そろった。'],'delicious':['形容詞','【形】とてもおいしい；くだけた用法で、とても愉快な・楽しい。'],'depressed':['形容詞','【形】気落ちした、憂うつな。'],'extremely':['副詞','【副】非常に、極めて。'],'fifteenth':['序数詞・名詞','【序】第15の。\n【名】15番目；15日。'],'happen':['動詞','【動】起こる、生じる。'],'introduce':['動詞','【動】紹介する；導入する。'],'knowledge':['名詞','【名】知識；知っていること。'],'movement':['名詞','【名】動き、動作；移動。'],'northeast':['名詞・形容詞・副詞','【名】北東。\n【形】北東の。\n【副】北東へ。'],'overdo':['動詞','【動】やり過ぎる、度を越す。'],'prepare':['動詞','【動】準備する、用意する。'],'receive':['動詞','【動】受け取る；迎える、受け入れる。'],'satisfied':['形容詞','【形】満足した；納得した。'],'shiver':['動詞・名詞','【動】寒さ・恐怖などで震える。\n【名】震え。'],'situation':['名詞','【名】状況、事態。'],'anywhere':['副詞','【副】どこかに、どこへでも；どこにも。'],'arrive':['動詞','【動】到着する、着く。'],'baptize':['動詞','【動】洗礼を授ける；洗礼名を付ける。'],'behave':['動詞','【動】振る舞う、行動する。'],'believe':['動詞','【動】信じる；～だと思う。'],'bully':['動詞・名詞','【動】いじめる、威圧する。\n【名】いじめる人、弱い者を威圧する人。'],'discover':['動詞','【動】発見する；気づく、知る。'],'drag':['動詞','【動】引きずる、無理に引っ張る。'],'exciting':['形容詞','【形】わくわくさせる、刺激的な。'],'family':['名詞','【名】家族、一家。'],'handsome':['形容詞','【形】（主に男性が）顔立ちの整った；立派な。'],'helpless':['形容詞','【形】自力ではどうにもできない、無力な。'],'identify':['動詞','【動】身元・正体を確認する、特定する。'],'interest':['名詞・動詞','【名】興味、関心。\n【動】興味を持たせる。'],'message':['名詞','【名】伝言、メッセージ。'],'painter':['名詞','【名】画家；塗装工。'],'plan':['名詞・動詞','【名】計画。\n【動】計画する。'],'pleasure':['名詞','【名】喜び、楽しみ。'],'portrait':['名詞','【名】肖像、肖像画。'],'problem':['名詞','【名】問題、難題。'],'produce':['動詞','【動】作り出す；提示する、取り出して見せる。'],'promise':['動詞・名詞','【動】約束する。\n【名】約束。'],'realize':['動詞','【動】理解する、気づく；実現する。'],'securely':['副詞','【副】しっかりと、安全に、外れないように。'],'shout':['動詞・名詞','【動】叫ぶ、大声で言う。\n【名】叫び声。'],'shut':['動詞・形容詞','【動】閉める、閉じる。\n【形】閉じた。'],'thousand':['数詞・名詞','【数】1000の。\n【名】1000。'],'unstable':['形容詞','【形】不安定な；精神・感情などが安定していない。'],'watch':['動詞・名詞','【動】注意して見る、見張る。\n【名】腕時計；見張り。'],'worry':['動詞・名詞','【動】心配する、心配させる。\n【名】心配、悩み。'],'young':['形容詞','【形】若い、年若い。'],'information':['名詞','【名】情報、知らせ。'],'interesting':['形容詞','【形】興味深い、おもしろい。'],'beautiful':['形容詞','【形】美しい、見事な。'],'beginning':['名詞','【名】始まり、初め。'],'breakfast':['名詞・動詞','【名】朝食。\n【動】朝食をとる。'],'carefully':['副詞','【副】注意深く、慎重に。'],'dangerous':['形容詞','【形】危険な。'],'excellent':['形容詞','【形】非常に優れた、すばらしい。'],'fantastic':['形容詞','【形】すばらしい；空想的な、現実離れした。'],'important':['形容詞','【形】重要な、大切な。'],'listen':['動詞','【動】聞く、耳を傾ける。'],'motorist':['名詞','【名】自動車を運転する人、ドライバー。'],'perform':['動詞','【動】行う、実行する；演じる。'],'suppose':['動詞','【動】～と思う；～と仮定する。'],'whistle':['動詞・名詞','【動】口笛を吹く；笛を鳴らす。\n【名】口笛；笛、警笛。'],'wonderful':['形容詞','【形】すばらしい、見事な。'],'abnormal':['形容詞','【形】異常な、普通ではない。'],'accident':['名詞','【名】事故；偶然の出来事。'],'answer':['動詞・名詞','【動】答える、返事をする。\n【名】答え、返事。'],'chicken':['名詞','【名】鶏；鶏肉。'],'continue':['動詞','【動】続ける、続く。'],'enjoy':['動詞','【動】楽しむ。'],'finish':['動詞・名詞','【動】終える、終わる。\n【名】終わり、仕上げ。'],'husband':['名詞','【名】夫。'],'potato':['名詞','【名】ジャガイモ。'],'suddenly':['副詞','【副】突然、急に。'],'together':['副詞','【副】一緒に；まとめて。'],'tomorrow':['副詞・名詞','【副】明日。\n【名】明日。'],'training':['名詞','【名】訓練、研修、トレーニング。'],'jeunesse':['外国語表現','【仏・名】若さ、青春。'],'arrivederla':['外国語表現','【伊・間投】さようなら、ごきげんよう。']
};

const tokenToLemma={
'inconveniently':'inconveniently','unfortunately':'unfortunately','inconvenient':'inconvenient','deliciously':'deliciously','fortunately':'fortunately','immediately':'immediately','possibility':'possibility','suggestions':'suggestion','unfortunate':'unfortunate','unhappiness':'unhappiness','arrivederl':'arrivederla','beforehand':'beforehand','completely':'completely','delightful':'delightful','directions':'direction','disgusting':'disgusting','enchanting':'enchanting','especially':'especially','everywhere':'everywhere','interested':'interested','particular':'particular','staircases':'staircase','suggesting':'suggest','sweetheart':'sweetheart','unpleasant':'unpleasant','advertisement':'advertisement','possibilities':'possibility','downstairs':'downstairs','experience':'experience','throughout':'throughout','understood':'understand','unfinished':'unfinished','vegetables':'vegetable','arresting':'arrest','brilliant':'brilliant','cigarette':'cigarette','completes':'complete','delicious':'delicious','depressed':'depressed','extremely':'extremely','fifteenth':'fifteenth','happening':'happen','introduce':'introduce','knowledge':'knowledge','movements':'movement','northeast':'northeast','overdoing':'overdo','preparing':'prepare','receiving':'receive','satisfied':'satisfied','shivering':'shiver','situation':'situation','suggested':'suggest','anywhere':'anywhere','arriving':'arrive','baptized':'baptize','behaving':'behave','believed':'believe','bullying':'bully','discover':'discover','dragging':'drag','exciting':'exciting','families':'family','handsome':'handsome','helpless':'helpless','identify':'identify','interest':'interest','jeunesse':'jeunesse','messages':'message','painters':'painter','planning':'plan','pleasure':'pleasure','portrait':'portrait','problems':'problem','produced':'produce','promised':'promise','realized':'realize','securely':'securely','shouting':'shout','shutting':'shut','thousand':'thousand','unstable':'unstable','watching':'watch','worrying':'worry','youngest':'young','information':'information','interesting':'interesting','understand':'understand','beautiful':'beautiful','beginning':'beginning','breakfast':'breakfast','carefully':'carefully','dangerous':'dangerous','excellent':'excellent','fantastic':'fantastic','important':'important','listening':'listen','motorists':'motorist','performed':'perform','supposing':'suppose','whistling':'whistle','wonderful':'wonderful','abnormal':'abnormal','accident':'accident','answered':'answer','chickens':'chicken','continue':'continue','enjoying':'enjoy','finished':'finish','happened':'happen','husbands':'husband','potatoes':'potato','suddenly':'suddenly','together':'together','tomorrow':'tomorrow','training':'training'
};
const deferred=new Set(['leamington','monkwell']);
const excluded=new Map([["everyone's",'GRAMMATICAL_CONTRACTION']]);

let addedDictionary=0;
for(const [lemma,[pos,meaning]] of Object.entries(specs)){
  const current=existing.get(key(lemma));
  if(current) continue;
  dict[lemma]={lemma,pos,coreMeaning:meaning,meaning,forms:'本文中では必要に応じて活用・派生形で現れる。',tags:[]};
  existing.set(key(lemma),lemma); addedDictionary++;
}

let addedVocabulary=0, deferredOccurrences=0, excludedOccurrences=0;
const coveredTokens=new Set();
for(const c of audit.candidates||[]){
  if(c.kind!=='REVIEW_NEW_LEXEME_OR_EXCLUSION')continue;
  const tk=key(c.surface);
  if(deferred.has(tk)){deferredOccurrences++;continue;}
  if(excluded.has(tk)){excludedOccurrences++;continue;}
  const lemma=tokenToLemma[tk]; if(!lemma)continue;
  const dk=existing.get(key(lemma)); if(!dk)throw new Error(`missing reviewed dictionary lemma ${lemma}`);
  let surface=norm(c.surface);
  let inThisPlay=null;
  if(tk==='arrivederl'){
    const text=norm(speechById.get(c.speechId)?.text);
    const m=text.match(/Arrivederlà/i); if(m)surface=m[0];
    inThisPlay='Paraviciniが別れ際に使うイタリア語風の挨拶で、「さようなら／ごきげんよう」の意味。';
  }
  if(tk==='jeunesse') inThisPlay='Paraviciniが若い頃を振り返ってフランス語で「若さ、青春」と言っている。';
  const rows=vocab[c.speechId]||=([]);
  if(rows.some(x=>key(x.surface)===key(surface)&&key(x.lemma)===key(dk)))continue;
  const item={surface,lemma:dk,meaning:dict[dk].meaning,playMeaning:Boolean(inThisPlay)};
  if(inThisPlay)item.inThisPlay=inThisPlay;
  rows.push(item); addedVocabulary++; coveredTokens.add(tk);
}

write(D,dict);write(V,vocab);
const ds=sha(D),vs=sha(V);
const contract=read('data/canonical-production-contract.json');for(const f of contract.files||[]){if(f.path===D)f.sha256=ds;if(f.path===V)f.sha256=vs;}write('data/canonical-production-contract.json',contract);
const manifest=read('data/canonical-integration-manifest.json');if(manifest.studyAssets?.wordDictionary){manifest.studyAssets.wordDictionary.sha256=ds;manifest.studyAssets.wordDictionary.entries=Object.keys(dict).length;}if(manifest.studyAssets?.lineVocabulary){manifest.studyAssets.lineVocabulary.sha256=vs;manifest.studyAssets.lineVocabulary.items=Object.values(vocab).reduce((n,r)=>n+(r?.length||0),0);manifest.studyAssets.lineVocabulary.annotatedSpeeches=Object.values(vocab).filter(r=>r?.length).length;}write('data/canonical-integration-manifest.json',manifest);
const report={schemaVersion:1,status:'APPLIED',reviewedSuspiciousTokenTypes:Object.keys(tokenToLemma).length+deferred.size+excluded.size,addedDictionaryEntries:addedDictionary,addedVocabularyItems:addedVocabulary,coveredTokenTypes:[...coveredTokens].sort(),deferredToPhase3:[...deferred],excluded:Object.fromEntries(excluded),deferredOccurrences,excludedOccurrences,finalDictionaryEntries:Object.keys(dict).length,finalVocabularyItems:Object.values(vocab).reduce((n,r)=>n+(r?.length||0),0),sha256:{dictionary:ds,vocabulary:vs}};
write('data/vocabulary-full-coverage-suspicious-repair.json',report);console.log(JSON.stringify(report,null,2));
