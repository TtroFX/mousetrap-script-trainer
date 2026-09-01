import fs from 'node:fs';
import crypto from 'node:crypto';

const scenes=['act1-scene1','act1-scene2','act2'];
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const writeJson=(file,value,pretty=false)=>fs.writeFileSync(file,JSON.stringify(value,null,pretty?2:0)+'\n');
const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// Japanese explanatory fields should not accidentally mix ordinary English prose.
// Character names and a handful of spelling-specific forms are intentionally left alone;
// everything else below is localized while preserving the note's meaning.
const phraseReplacements=[
  ['It’s all been such fun. Watching you all. And pretending to be a policeman.','全部とても楽しかった。みんなを観察して、警官のふりをするのが。'],
  ["It's all been such fun. Watching you all. And pretending to be a policeman.",'全部とても楽しかった。みんなを観察して、警官のふりをするのが。'],
  ['the police take every eventuality into account','警察はあらゆる可能性を考慮する'],
  ['all criminals slip up sooner or later','犯罪者は誰でも遅かれ早かれ失敗する'],
  ['police are anxious to interview','警察がぜひ事情を聞きたがっている'],
  ['talk of the devil and there he is','噂をすれば本人が現れる'],
  ['The North Wind doth blow...','北風が吹く……'],
  ['These crimes were planned.','これらの犯行は計画されていた。'],
  ['We don’t actually know a thing.','実際のところ、私たちは何一つ分かっていない。'],
  ["We don't actually know a thing.",'実際のところ、私たちは何一つ分かっていない。'],
  ['Murder isn’t just fun and games.','殺人は単なる遊びではない。'],
  ["Murder isn't just fun and games.",'殺人は単なる遊びではない。'],
  ['I’m in charge of this investigation','この捜査の責任者は私だ'],
  ["I'm in charge of this investigation",'この捜査の責任者は私だ'],
  ['We’re investigating a murder','私たちは殺人事件を捜査している'],
  ["We're investigating a murder",'私たちは殺人事件を捜査している'],
  ['Unless he’s here already.','犯人がもうここにいるのでなければ。'],
  ["Unless he's here already.",'犯人がもうここにいるのでなければ。'],
  ['Chris Wren’s Prefab Nests','クリス・レンのプレハブ巣箱住宅'],
  ["Chris Wren's Prefab Nests",'クリス・レンのプレハブ巣箱住宅'],
  ['got the bit between their teeth','手綱を振り切る'],
  ['exactly what I wanted','まさに私が望んでいたこと'],
  ['strictly private affair','完全に私的な用事'],
  ['killer’s enjoying this','犯人はこれを楽しんでいる'],
  ["killer's enjoying this",'犯人はこれを楽しんでいる'],
  ['We don’t frame people.','私たちは人を陥れたりしない。'],
  ["We don't frame people.",'私たちは人を陥れたりしない。'],
  ['You just didn’t bother.','あなたはただ気にも留めなかった。'],
  ["You just didn't bother.",'あなたはただ気にも留めなかった。'],
  ['You ought to know','あなたなら知っているはずだ'],
  ['the police have a clue','警察は手掛かりをつかんだ'],
  ['everyone is under suspicion','全員が疑いの対象だ'],
  ['I can’t believe it','信じられない'],
  ["I can't believe it",'信じられない'],
  ['It’s my name now.','今はそれが私の名前だ。'],
  ["It's my name now.",'今はそれが私の名前だ。'],
  ['It’s just facts.','これは事実にすぎない。'],
  ["It's just facts.",'これは事実にすぎない。'],
  ['It’s a trap.','これは罠だ。'],
  ["It's a trap.",'これは罠だ。'],
  ['This is the First','これは一番目'],
  ['My name’s Wren','名前はWren'],
  ["My name's Wren",'名前はWren'],
  ['No sporting instinct','スポーツマン精神がない'],
  ['not-not very original','あまり独創的ではない'],
  ['despair turns to joy','絶望が喜びに変わる'],
  ['served its purpose','目的を果たした'],
  ['make a go of it','うまくやって成功させる'],
  ['police protection','警察の保護'],
  ['private joke','内輪の冗談'],
  ['signature tune','お決まりのテーマ曲'],
  ['soft felt hat','柔らかいフェルト帽'],
  ['Army psychologist','陸軍の心理担当者'],
  ['Army desertion','陸軍からの脱走'],
  ['Army service','陸軍勤務'],
  ['Detective Sergeant Trotter','Trotter刑事巡査部長'],
  ['Sergeant Trotter','Trotter巡査部長'],
  ['Superintendent Hogben','Hogben警視'],
  ['Berkshire Police','バークシャー警察'],
  ['Scotland Yard','スコットランド・ヤード'],
  ['Longridge Farm','ロングリッジ農場'],
  ['Monkswell Manor','モンクスウェル・マナー'],
  ['Culver Street','カルヴァー・ストリート'],
  ["St. Paul's",'セント・ポール大聖堂'],
  ['Villa Mariposa','ヴィラ・マリポサ'],
  ['Three Blind Mice','三匹の盲目のねずみ'],
  ['Little Bo-Peep','リトル・ボー・ピープ'],
  ['Benares brass','ベナレスの真鍮細工'],
  ['Memsahibish','メムサーヒブ風'],
  ['writing room','書き物部屋'],
  ['writing table','書き物机'],
  ['lower classes','下層階級'],
  ['guest house','ゲストハウス'],
  ['call box','電話ボックス'],
  ['wireless licence','ラジオ受信許可証'],
  ['private hotel','小規模ホテル'],
  ['ration books','配給手帳'],
  ['drawing room','客間'],
  ['winter sports','ウィンタースポーツ'],
  ['corned beef','コンビーフ'],
  ['welfare workers','福祉職員'],
  ['deadly danger','命に関わる危険'],
  ['felt hat','フェルト帽'],
  ['third degree','強圧的な取調べ'],
  ['cunning brain','狡猾な頭脳'],
  ['juicy murder','興味をそそる殺人事件'],
  ['Useful description.','役に立つ人相書きだ。'],
  ['I like murder!','殺人事件が好き！'],
  ['you were wonderful','あなた、すばらしかったわ'],
  ['you brute','役立たずね'],
  ['cold feet','怖気づく'],
  ['Ticked off!','叱られた！'],
  ['In-deed.','ほう。'],
  ['Now there was a young lady...','さて、ある若い女性が……'],
  ['lay of the land','屋敷の配置'],
  ['if I wanted to','その気になれば'],
  ['great fun','大いに楽しい'],
  ['such fun','とても楽しい'],
  ['killer','犯人'],
  ['conveniently','都合よく'],
  ['inconveniently','不都合に'],
  ['Gibraltar','ジブラルタル'],
  ['Edinburgh','エディンバラ'],
  ['Hampstead','ハムステッド'],
  ['Kensington','ケンジントン'],
  ['Knightsbridge','ナイツブリッジ'],
  ['London','ロンドン'],
  ['Act 2','第2幕'],
  ['Scene 1・2','第1場・第2場'],
  ['Scene 1','第1場'],
  ['Scene 2','第2場']
];

const wordReplacements=new Map(Object.entries({
  'respectable':'立派',
  'sympathetic':'感じがよい',
  'Indeed':'なるほど',
  'disaster':'大惨事',
  'mugs':'間抜け',
  'dramatize':'芝居がかった物語として語る',
  'admirable':'素晴らしい',
  'perfect':'完璧だ',
  'business':'用事',
  'Red':'赤',
  'pale':'淡い',
  'pink':'ピンク',
  'devil':'悪魔',
  'references':'身元照会先',
  'reference':'身元照会先',
  'cloakroom':'クロークルーム',
  'skis':'スキー',
  'hearty':'元気いっぱい',
  'inspector':'警部',
  'Inspector':'警部',
  'sergeant':'巡査部長',
  'Sergeant':'巡査部長',
  'nylons':'ナイロンストッキング',
  'library':'書斎',
  'safety':'安全',
  'notebook':'手帳',
  'signature':'印',
  'horrible':'ひどい',
  'schizophrenic':'統合失調症',
  'servants':'使用人',
  'wonderful':'素晴らしい',
  'melodramatic':'芝居がかった',
  'joke':'冗談',
  'macabre':'不気味',
  'nerves':'神経過敏',
  'spiv':'闇商人',
  'psychologists':'心理学者たち',
  'extension':'内線電話',
  'mechanics':'仕組み',
  'muffler':'マフラー',
  'fantastic':'荒唐無稽だ',
  'crimes':'犯行',
  'crime':'犯行',
  'radio':'ラジオ',
  'murderer':'犯人',
  'murder':'殺人',
  'criminals':'犯罪者',
  'policemen':'警察官',
  'policeman':'警官',
  'police':'警察',
  'investigation':'捜査',
  'investigating':'捜査している',
  'opportunity':'機会',
  'reinforcements':'応援',
  'makeup':'化粧',
  'clue':'手掛かり',
  'trap':'罠',
  'game':'遊び',
  'games':'遊び',
  'magistrate':'治安判事',
  'Bench':'判事席',
  'Act':'幕',
  'Scene':'場',
  'Army':'陸軍',
  'purpose':'目的'
}));

function localize(text){
  let out=String(text);
  for(const [from,to] of phraseReplacements)out=out.replaceAll(from,to);
  for(const [from,to] of wordReplacements){
    const re=new RegExp(`\\b${from.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\b`,'g');
    out=out.replace(re,to);
  }
  // Mixed-language leftovers whose grammar needs a phrase-level repair.
  out=out.replaceAll('立派 な家','立派な家');
  out=out.replaceAll('芝居がかった物語として語る しており','芝居がかった物語として語っており');
  out=out.replaceAll('Edinburgh勤務のMajor','エディンバラ勤務の少佐');
  out=out.replaceAll('エディンバラ勤務のMajor','エディンバラ勤務の少佐');
  out=out.replaceAll('devil側','悪魔側');
  return out;
}

let changedNotes=0;
for(const scene of scenes){
  const file=`data/interpretation/${scene}.json`;
  const data=readJson(file);
  for(const notes of Object.values(data.interpretations||{})){
    for(const note of notes||[]){
      const before=String(note.text||'');
      let after=localize(before);
      // These isolated place/title cases intentionally cannot use the global bare-token rule,
      // because Monkswell/Monkwell spelling is itself discussed in Act I Scene I.
      if(scene==='act2'&&after.includes('Monkswellという地名'))after=after.replaceAll('Monkswellという地名','モンクスウェルという地名');
      if(after!==before){note.text=after;changedNotes++;}
    }
  }
  writeJson(file,data,false);
}

// Translation is already Japanese in almost all cases. Localize the recurring nursery-rhyme
// title and one inconsistent surname rendering, while preserving spelling-joke forms such as
// Monkswell/Monkwell, single letters, postcodes, and person-name wordplay.
const translationsFile='mousetrap_line_translations.json';
const translations=readJson(translationsFile);
let changedTranslations=0;
for(const entry of Object.values(translations)){
  const before=String(entry?.translation||'');
  let after=before.replaceAll('Three Blind Mice','三匹の盲目のねずみ');
  after=after.replaceAll('Lyonという名前では','ライアンという名前では');
  if(after!==before){entry.translation=after;changedTranslations++;}
}
writeJson(translationsFile,translations,true);

// Canonical translation hash must follow the edited canonical file.
const contractFile='data/canonical-production-contract.json';
const contract=readJson(contractFile);
const translationContract=contract.files?.find(x=>x.path===translationsFile);
if(!translationContract)throw new Error('translation canonical contract entry missing');
translationContract.sha256=sha256(translationsFile);
writeJson(contractFile,contract,true);

// Force installed PWAs to receive the new data instead of reusing the old data cache.
const versionFile='app/pwa-version.json';
const version=readJson(versionFile);
const oldBuild=String(version.buildId||'');
const match=oldBuild.match(/^(.*-r)(\d+)$/);
if(!match)throw new Error(`unexpected buildId: ${oldBuild}`);
const newBuild=`${match[1]}${Number(match[2])+1}`;
version.buildId=newBuild;
version.dataVersion='canonical-2026-09-01-japanese-prose-v1';
writeJson(versionFile,version,true);
for(const file of ['app/src/config.js','app/sw.js']){
  const before=fs.readFileSync(file,'utf8');
  if(!before.includes(oldBuild))throw new Error(`${file}: old build id not found`);
  fs.writeFileSync(file,before.replaceAll(oldBuild,newBuild));
}

console.log(JSON.stringify({status:'FIXED',changedNotes,changedTranslations,oldBuild,newBuild,translationSha256:translationContract.sha256},null,2));
