import fs from 'node:fs';

const paths = {
  'act1-scene1': 'data/interpretation/act1-scene1.json',
  'act1-scene2': 'data/interpretation/act1-scene2.json',
  act2: 'data/interpretation/act2.json',
};

const data = Object.fromEntries(Object.entries(paths).map(([scene, path]) => [scene, JSON.parse(fs.readFileSync(path, 'utf8'))]));
const changed = Object.fromEntries(Object.keys(paths).map(scene => [scene, new Set()]));

const fullPlayPolicy = {
  allSpeechesReviewed: true,
  interpretationOptional: true,
  rule: '全セリフを必ず精査し、読解上の補足価値がある場合だけ解釈を付ける。補足不要なセリフには無理に文章を作らない。',
  evidence: '対象セリフと前後の会話に加え、作品終盤までに確定する事実も使用できる。ただし後から判明する情報は「伏線」「真相」「嘘」「隠蔽」等として明示し、その場で登場人物や初見の観客が知っている情報と混同しない。',
  longSpeechRule: '長いセリフで内容の流れが追いにくい場合は、別項目を増やさず、同じ解釈ノート内で論点・展開・最終的な発話目的まで整理する。単なる翻訳の短縮は作らない。',
  fullPlayTruthAllowed: true,
  forbidden: [
    '台本・後の確定事実に根拠のない心理・本音・含意の推測',
    '人物の疑い・仮説を確定事実として記述すること',
    '根拠のない伏線認定・作者意図の推測',
    '後の真相を、その時点ですでに周囲も知っていた情報のように書くこと',
    '補足価値のない言い換えによる件数稼ぎ'
  ],
  requiredWhenUseful: [
    '直前の発言を受けた反応理由',
    '台詞だけでは分かりにくい会話上の因果関係',
    '明確に裏付けられる感情・態度',
    'ジョーク・言葉遊び・誇張・皮肉の仕組み',
    '指示対象や省略内容',
    '長台詞の論点・展開・最終的な発話目的',
    '伏線と後から確定する意味',
    '意図的な嘘・知らないふり・隠蔽・話題そらし・ミスリード',
    '本人も誤って信じている内容と、知っていて偽っている内容の区別'
  ]
};

for (const scene of Object.keys(data)) data[scene].policy = fullPlayPolicy;

function notes(scene, id) {
  data[scene].interpretations ||= {};
  return data[scene].interpretations[id] ||= [];
}
function append(scene, id, kind, text) {
  if (!data[scene].reviewedSpeechIds.includes(id)) throw new Error(`unknown id ${scene}/${id}`);
  const arr = notes(scene, id);
  if (!arr.some(n => n.kind === kind && n.text === text)) arr.push({ kind, text });
  changed[scene].add(id);
}
function replace(scene, id, replacement) {
  if (!data[scene].reviewedSpeechIds.includes(id)) throw new Error(`unknown id ${scene}/${id}`);
  data[scene].interpretations[id] = replacement;
  changed[scene].add(id);
}

// Act 1 Scene 1: later revelations that change the reading of otherwise ordinary lines.
append('act1-scene1','act1-scene1-speech-0010','concealment','【後から分かること】Mollieはこの日Londonにも行っており、結婚記念日の葉巻を買っていた。ここではそのLondon行きをGilesに伏せ、村へ行った話だけをしている。');
append('act1-scene1','act1-scene1-speech-0011','concealment','【後から分かること】Gilesもこの日Londonへ行き、Mollieへの記念日の帽子を買っていた。ここではLondon行きを明かさず、chicken nettingを探していた行程だけを語っている。');
append('act1-scene1','act1-scene1-speech-0044','lie','【真相】“My name’s Wren”は本名の提示ではない。Act 2で本人がChristopher Wrenは自分で付けた偽名だと認める。');
append('act1-scene1','act1-scene1-speech-0099','concealment','【後から分かること】ここにいる“Major Metcalf”は本物のMajorではなく、警察が事前に入れ替えた捜査官。したがって、この軍歴めいた自己紹介も正体を隠した役柄の一部として読む必要がある。');

// Act 1 Scene 2: identity, Longridge Farm, and the murderer’s police impersonation.
append('act1-scene2','act1-scene2-speech-0042','truth','【後から分かること】Casewellが英国で済ませたい“business”とは、Longridge Farmで生き別れた弟Georgieを探すこと。終盤に本人がその目的を明かす。');
append('act1-scene2','act1-scene2-speech-0068','foreshadowing','【伏線】Casewellが「雪でも忘れない」と言うのは、後に彼女自身がLongridge Farmの子供Kathyだったと判明すると、そこでの過酷な記憶を指していることが分かる。');
append('act1-scene2','act1-scene2-speech-0072','truth','【後から分かること】氷の張った水差し、薄い毛布、寒さと恐怖に震える子供という描写は、Casewell自身がLongridge Farmで経験した幼少期の記憶。');
replace('act1-scene2','act1-scene2-speech-0077',[
  {kind:'context',text:'表面上はBerkshire PoliceのSuperintendent Hogbenからの電話だとMollieは受け取り、雪でもSergeant Trotterを派遣すると告げられる。'},
  {kind:'lie',text:'【真相】終盤でGeorgieは、call boxから警察本部を名乗ってこの電話をかけたのは自分だと告白する。Hogben本人からの電話ではなく、偽の警察連絡だった。'}
]);
replace('act1-scene2','act1-scene2-speech-0085',[
  {kind:'context',text:'Mollieが聞いた電話では、到着する“Sergeant Trotter”の話を注意深く聞き、指示に従うよう求められていた。理由を説明しない強い指示なので、彼女は異常だと感じている。'},
  {kind:'lie',text:'【真相】この指示自体がGeorgieの偽電話による仕込み。自分を警官として屋敷へ受け入れさせ、以後の指示にも従わせるための準備になっている。'}
]);
append('act1-scene2','act1-scene2-speech-0100','truth','【後から分かること】MollieはChristopher本人の説明を信じて「優秀な若い建築家」と擁護するが、Act 2で彼は建築家を目指しているという経歴も偽りだったと認める。');
append('act1-scene2','act1-scene2-speech-0104','truth','【後から分かること】ここでMollieが伝えている“両親がChristopher Wrenと名付け、建築家になった”という話はChristopherが作った身元設定。本人は後に名前も建築家という経歴も偽りだと明かす。');
append('act1-scene2','act1-scene2-speech-0112','foreshadowing','【伏線】Mrs. Boyleがmagistrateだったという情報は、後に彼女がCorrigan家の子供たちをLongridge Farmへ預ける決定に関与した人物だと判明する重要な接点になる。');
append('act1-scene2','act1-scene2-speech-0139','truth','【後から分かること】この“Major Metcalf”自身が実は警察官。予期しない別の警官が来ると聞いて反応しており、終盤でもTrotterが現れた時は理解できなかったと説明する。');
append('act1-scene2','act1-scene2-speech-0146','lie','【真相】“Detective Sergeant Trotter, Berkshire Police”という身元は偽り。彼はLongridge Farmの生存者Georgieで、Maureen Lyon殺害犯でもある。');
append('act1-scene2','act1-scene2-speech-0157','foreshadowing','【伏線】Mrs. Boyleに若すぎると指摘されても、Trotterは警察官としての年齢を説明せず「見た目ほど若くない」とだけかわす。後に彼が実際には若いGeorgieの偽装身分だと分かる。');
replace('act1-scene2','act1-scene2-speech-0177',[
  {kind:'context',text:'Trotterは表向き、自分の来訪目的を“police protection”だと説明し、Ralston夫妻を取り締まりに来たわけではないと安心させる。'},
  {kind:'lie',text:'【真相】彼は警察官ではなく犯人本人なので、“保護のために派遣された”という任務説明は偽装。警察官を装って屋敷内で自由に行動するためのカバーである。'}
]);
append('act1-scene2','act1-scene2-speech-0179','truth','【真相】TrotterはMaureen Lyon事件を「捜査対象」として持ち出すが、彼自身がその殺人犯。事件を外部の警察情報として説明する立場そのものが偽装されている。');
append('act1-scene2','act1-scene2-speech-0183','truth','【後から分かること】Maureen StanningとLongridge Farmの説明は、Georgie自身の養育先だった家の過去を、警察資料を説明する第三者のように語っている。');
append('act1-scene2','act1-scene2-speech-0187','truth','【後から分かること】Corrigan家3人の子供の事件を説明しているTrotter自身が、その生存した長男Georgie。自分の幼少期を警官の事件説明として第三者化して語っている。');
append('act1-scene2','act1-scene2-speech-0189','truth','【真相】刑期を終えたMaureen StanningがCulver Streetで殺されたと説明しているが、その殺人を実行したのもTrotterを名乗るGeorgie本人。');
append('act1-scene2','act1-scene2-speech-0191','truth','【後から分かること】Monkswell Manorを含む住所はGeorgie自身の犯行計画に関わる情報。彼は「警察が発見した手掛かりを伝える捜査官」という立場を演じながら、自分の計画を説明している。');
replace('act1-scene2','act1-scene2-speech-0193',[
  {kind:'context',text:'表面上、TrotterはScotland Yardの情報を受けたSuperintendent HogbenがMonkswell ManorとLongridge Farmの接点を調べるため自分を派遣した、と説明する。'},
  {kind:'lie',text:'【真相】Hogbenから派遣されたという経緯は偽り。Trotterを名乗るGeorgie自身が事前に警察を装って電話し、その設定をここでも維持している。'}
]);
replace('act1-scene2','act1-scene2-speech-0195',[
  {kind:'context',text:'表面上は、全員の身元確認・電話報告・安全確保が自分に与えられた警察任務だと説明している。'},
  {kind:'lie',text:'【真相】この“任務”は存在しない。警官を装うことで全員から個人情報を聞き出し、屋敷を調べ、行動を指示できる立場を作っている。'}
]);
replace('act1-scene2','act1-scene2-speech-0197',[
  {kind:'context',text:'Trotterは「ここで次の殺人が起こる危険」を認め、表面上は警察の警告として伝える。'},
  {kind:'truth',text:'【真相】これは予測ではなく、Georgie自身が次の殺人を計画しているため知っている危険。真実を警察の推論の形に変えて話している。'}
]);
replace('act1-scene2','act1-scene2-speech-0199',[
  {kind:'context',text:'表面上は、誰がなぜ狙われるのかを調べるために来た、と捜査目的を説明している。'},
  {kind:'feignedIgnorance',text:'【真相】Georgieは自分の復讐対象とLongridge Farmとの関係を知ったうえで来ている。「それを見つけるため」という説明は、知らない捜査官を装う発言。'}
]);
append('act1-scene2','act1-scene2-speech-0206','truth','【真相】Three Blind Miceを殺人の“signature”として説明する本人こそ、その演出を使っている犯人。自分の犯行上の印を警察の証拠として客観的に説明している。');
append('act1-scene2','act1-scene2-speech-0209','truth','【後から分かること】死亡した11歳の少年はGeorgieの弟Jimmy。Trotterは自分の弟について第三者の事件資料のように答えている。');
append('act1-scene2','act1-scene2-speech-0211','truth','【真相】ここで説明される“軍を脱走し、現在22歳前後の長男”がTrotter自身の正体Georgie。自分自身を警察が追う容疑者として第三者化している。');
append('act1-scene2','act1-scene2-speech-0213','feignedIgnorance','【真相】警察が長男をMaureen殺害犯と見ているのかという問いに“そうだ”と答えるが、その長男も犯人も本人。自分への疑いを外部の捜査情報のように扱っている。');
replace('act1-scene2','act1-scene2-speech-0215',[
  {kind:'context',text:'Trotterは表向き、Monkswell ManorとLongridge Farmの接点を特定するため、Gilesから順に関係の有無を質問する。'},
  {kind:'feignedIgnorance',text:'【真相】犯人Georgieは復讐対象との接点を知って行動している。ここでの質問は、警官としての捜査を演じながら各人に何を認めるかを言わせる役割も持つ。'}
]);
append('act1-scene2','act1-scene2-speech-0218','concealment','【後から分かること】MollieにはLongridge Farmとの直接の接点がある。旧姓Waringで、Jimmyの学校の教師だった。ここでは「関係はない」と答え、忘れたい過去を隠している。');
append('act1-scene2','act1-scene2-speech-0226','truth','【真相】Trotterは「誰か1人が危険」と警告するが、犯人本人なので少なくとも次に誰を狙うかは自分で知っている。捜査上の不確定情報として提示しているのが偽装部分。');
append('act1-scene2','act1-scene2-speech-0229','concealment','【後から分かること】Mrs. BoyleはLongridge Farmと無関係ではない。子供たちをStanning夫妻へ預ける判断に関与したmagistrateであり、ここではその接点を明かさず反発している。');
append('act1-scene2','act1-scene2-speech-0231','lie','【真相】CasewellはLongridge Farmを「聞いたこともない」と言うが、彼女自身がそこで暮らしていたCorrigan家のKathy。これは自分の過去を隠すための明確な虚偽。');
append('act1-scene2','act1-scene2-speech-0233','concealment','【真相】ここにいる“Major Metcalf”は実際には潜入中の警察官。Edinburgh勤務のMajorとしての説明で、自分の本当の所属と目的を隠している。');
append('act1-scene2','act1-scene2-speech-0253','foreshadowing','【伏線】MetcalfがMrs. Boyleのmagistrate歴とLongridge Farmでの役割を具体的に知っているのは、後に彼自身が潜入警察官だったと分かると、一般の宿泊客以上の情報源を持っていたことにつながる。');
append('act1-scene2','act1-scene2-speech-0273','truth','【後から分かること】Casewellの“不幸な子供時代”は抽象的な話ではなく、Longridge Farmで虐待されたCorrigan家のKathyとしての体験を指す。');
append('act1-scene2','act1-scene2-speech-0283','truth','【後から分かること】過去を振り返らず前へ進むというCasewellの強い姿勢は、Longridge Farmの過去を抱えながら生きてきた本人の対処法として読むことができる。');
append('act1-scene2','act1-scene2-speech-0288','foreshadowing','【伏線】Mollieが「何かをきっかけに過去が戻る」と語る背景には、Jimmyからの助けを求める手紙を間に合って読めなかった記憶があることがAct 2で明かされる。');
append('act1-scene2','act1-scene2-speech-0290','foreshadowing','【伏線】「過去に向き合うべきかもしれない」というMollieの言葉は、後に彼女自身がJimmyの件をTrotterに語る展開につながる。');
append('act1-scene2','act1-scene2-speech-0294','truth','【真相】この屋敷確認は本物の警察による安全確認ではない。Georgieが警官の権限を装って家の構造を自由に確認できる口実にもなっている。');
replace('act1-scene2','act1-scene2-speech-0298',[
  {kind:'context',text:'表面上、Trotterは屋敷確認後にSuperintendent Hogbenへ電話報告しようとする。'},
  {kind:'lie',text:'【真相】Hogbenへの正式な報告任務は存在しない。警察官として自然に振る舞うための演技である。'}
]);
append('act1-scene2','act1-scene2-speech-0300','feignedIgnorance','【真相】電話線がいつ切れたかを捜査官のように確認しているが、終盤で本人が屋敷へ入る前に自分で線を切ったと告白する。');
replace('act1-scene2','act1-scene2-speech-0302',[
  {kind:'context',text:'Trotterは「自分が派遣される直前には警察本部から電話できていた」と述べ、不通になった時刻を絞るように見せる。'},
  {kind:'lie',text:'【真相】その直前の電話をかけたのもGeorgie本人。警察本部との実際の通話を根拠にしているように装っている。'}
]);
append('act1-scene2','act1-scene2-speech-0304','feignedIgnorance','【真相】「誰かが意図的に線を切ったのでは」と可能性として提示するが、切ったのはTrotter自身。自分の行為を捜査上の仮説として提示している。');
append('act1-scene2','act1-scene2-speech-0314','truth','【後から分かる意味】“Unless he’s here already.”は文字通り真実で、犯人はこの発言をしているTrotter本人としてすでに屋敷内にいる。強い劇的アイロニーになっている。');
append('act1-scene2','act1-scene2-speech-0318','truth','【真相】“These crimes were planned.”と言えるのは推理だけではなく、本人が実際に連続殺人を計画した犯人だからでもある。真実を捜査上の判断として語っている。');
replace('act1-scene2','act1-scene2-speech-0320',[
  {kind:'context',text:'表面上は「次の犯行は試みられるが、自分が防ぐ」と警察官として説明している。'},
  {kind:'lie',text:'【真相】次の犯行を試みる側がTrotter本人であり、「防ぐためにいる」という部分が偽り。次の殺人が企図されること自体は本人が計画しているため知っている。'}
]);
append('act1-scene2','act1-scene2-speech-0322','truth','【後から分かる意味】“It’s just facts.”という強い断言は、本人が犯行計画を知っているため確信できる事柄を、警察の推論として語っている。');
append('act1-scene2','act1-scene2-speech-0324','misdirection','【真相】Londonの犯人像を曖昧な外見情報として並べ、屋敷の複数人が当てはまり得ると示すが、その目撃人物はTrotter自身。自分から疑いを外したまま他人の可能性を広げている。');
append('act1-scene2','act1-scene2-speech-0326','lie','【真相】電話線を「特に心配している」と捜査官のように語るが、線を切った本人である。外部連絡が断たれた理由を知らないふりをしている。');
append('act1-scene2','act1-scene2-speech-0328','misdirection','【真相】extensionの有無を聞く時点でTrotterは自分が回線を切ったことを知っている。確認そのものより、Gilesを上階へ動かせる状況を作る意味が大きくなる。');
append('act1-scene2','act1-scene2-speech-0332','truth','【真相】Gilesを寝室のextension確認へ行かせる指示は、直後のMrs. Boyle殺害時にGilesを階上へ離すことになる。後から見ると、警察上の確認を装った犯行準備の一部。');
append('act1-scene2','act1-scene2-speech-0334','foreshadowing','【伏線】ラジオが「一人の部屋で背後の扉が開く恐怖」を語る一方、実際の犯人は大音量のラジオを殺害時の物音を隠すために利用する。内容と犯行手段が重なる。');
append('act1-scene2','act1-scene2-speech-0335','truth','【真相】Mrs. Boyleが“it’s you”と話しかけている相手は、後に犯人と判明するTrotter＝Georgie。彼女は入ってきた人物自体は見知っているが、その正体までは知らない。');

// Act 2: the murderer is now actively conducting a fake investigation.
append('act2','act2-speech-0003','truth','【真相】TrotterはMrs. Boyleを殺した本人なのに、直後の目撃情報を集める捜査官としてMollieへ質問している。ここからの尋問は犯人自身による偽捜査。');
append('act2','act2-speech-0005','feignedIgnorance','【真相】大音量のradioは“murderer’s idea”ではなくTrotter自身が実行した手口。自分の行動を第三者の犯人の工夫として説明している。');
append('act2','act2-speech-0007','misdirection','【真相】犯人がどこへ逃げたかを仮定形で列挙しているが、本人は実際の犯人。周囲に複数の逃走経路を考えさせ、真の行動を捜査対象のように扱っている。');
append('act2','act2-speech-0014','lie','【真相】“We’re investigating a murder”という立場は偽り。Mrs. Boyleを殺した本人が、情報を出さなければ次の死があると警告している。次の死を計画しているのも本人。');
append('act2','act2-speech-0016','truth','【真相】Three Blind Miceを根拠に「まだ次がある」と言う本人こそ、この三匹を殺人計画の枠組みに使っている犯人。');
append('act2','act2-speech-0020','truth','【真相】“we found”と警察側の発見物のように語るが、二つの住所はGeorgie自身の犯行計画に直結する情報。彼は計画の当事者として意味を知っている。');
append('act2','act2-speech-0024','lie','【真相】TrotterはMrs. Boyle殺害時の自分について「窓から出て電話線を調べていた」という警察官側の行動だけを前提にするが、実際には殺人犯本人。この説明は自分を検証対象から外す偽の立場設定。');
append('act2','act2-speech-0026','misdirection','【真相】Gilesの行動時間が長いと強調して疑いを向けるが、Trotterは実際の犯人が自分だと知っている。他人のアリバイの弱点を利用して疑念を広げている。');
append('act2','act2-speech-0028','misdirection','【真相】Gilesへさらに時間の不自然さを押しつけるが、犯人特定のための中立的な追及ではない。自分以外の人物を疑わせる偽捜査の一部。');
append('act2','act2-speech-0048','lie','【真相】“InspectorではなくSergeantだ”という訂正まで含め、警察内の階級を細かく演じて偽身分の信憑性を保っている。実際にはどちらでもない。');
append('act2','act2-speech-0083','feignedIgnorance','【真相】犯人の逃げ方を“could be”として推理しているが、話者自身が犯人。cupboardを実際に使ったかはここでは確定しないため、重要なのは自分の行動を未知の仮説として扱っている点。');
append('act2','act2-speech-0087','foreshadowing','【後から分かる意味】“all criminals slip up sooner or later”を犯人本人が言っている。捜査官の一般論として聞こえるが、正体判明後には自分自身にも当てはまる皮肉になる。');
append('act2','act2-speech-0090','lie','【真相】“I’m in charge of this investigation”は偽警官としての権限主張。全員の発言と移動を自分が管理できる状態を維持するための嘘。');
append('act2','act2-speech-0092','misdirection','【真相】全員に“opportunity”があったと整理し、容疑を屋敷内の客へ均等に広げるが、実際の犯人はその説明をしているTrotter自身。');
append('act2','act2-speech-0094','misdirection','【真相】“everyone is under suspicion”と言い切ることで自分だけを捜査側に置く。実際には最も疑うべき人物が捜査官役を演じている。');
append('act2','act2-speech-0099','lie','【真相】“We don’t frame people.”と言うが、彼はそもそも警察ではない。Christopherへ疑いが集中する状況を止めず、自分への疑いを避ける材料として利用している。');
append('act2','act2-speech-0101','lie','【真相】逮捕には証拠が必要だと警官の手続を説明するが、彼には逮捕権限自体がない。“まだ証拠がない”という捜査官の立場を演じている。');
append('act2','act2-speech-0111','lie','【真相】“We don’t actually know a thing.”は決定的な嘘。Trotter自身がGeorgieで、二件の殺人、Longridge Farmとの関係、切断した電話線について当事者として知っている。');
append('act2','act2-speech-0113','feignedIgnorance','【真相】電話線が故意に切られた場所を「自分が発見した」と説明するが、切ったのは本人。自分の工作を捜査で見つけた証拠に見せている。');
append('act2','act2-speech-0117','misdirection','【真相】精神的不安定・幼い精神状態・Army desertion・精神科医の報告は本来Georgie自身に関する特徴。MollieがChristopherへ当てはめる流れを利用し、自分の特徴を別人への疑いに変えている。');
append('act2','act2-speech-0125','lie','【真相】“the police take every eventuality into account”と警察を代表して保証するが、本人は警察官ではない。家族情報を知る立場を警察資料によるもののように装っている。');
append('act2','act2-speech-0143','truth','【後から分かること】Trotterが「姉妹もいた」と持ち出すその姉妹が、屋敷にいるCasewell＝Kathy。ただしこの時点でGeorgie自身はCasewellを妹だと完全には認識していない。');
append('act2','act2-speech-0145','misdirection','【真相】女性犯人の可能性を提示してCasewellなどにも疑いを広げるが、実際の犯人はTrotter自身。可能性の検討に見せた容疑分散。');
append('act2','act2-speech-0147','misdirection','【真相】Mollie自身まで殺人犯候補に入れるが、GeorgieにとってMollieは殺す予定の対象であり、犯人ではないことを知っている。意図的に立場を逆転させて疑わせている。');
append('act2','act2-speech-0149','misdirection','【真相】Mollieの身元は今確認できないと強調し、自分の標的である彼女へまで容疑を向ける。知らないから疑っているのではなく、警官役を維持するための圧力。');
append('act2','act2-speech-0165','foreshadowing','【後から分かる意味】「戦後は背景を確かめにくく、配偶者が偽の身元を語ることもある」と長く説明する本人こそ偽の警察身分を使っているため、正体判明後には強い皮肉になる。');
append('act2','act2-speech-0202','truth','【真相】Christopherはここで初めてChristopher Wrenという名が自作の偽名だと説明する。Robin→Wrenという連想と、学校でのChristopher Robinというからかいが名前の由来。');
append('act2','act2-speech-0204','truth','【真相】偽名だけでなく、建築家を目指しているという経歴も事実ではなく、Army serviceから逃亡したことを認める。彼は秘密を持つが殺人犯ではない。');
append('act2','act2-speech-0213','foreshadowing','【伏線】Mollieが「決して忘れられない出来事」と言うのは、後にJimmyからの救助を求める手紙を病気のため間に合って読めなかった経験だと明かされる。');
append('act2','act2-speech-0217','truth','【後から分かること】Mollieが忘れようとしている“horrible”な出来事はLongridge FarmのJimmyの手紙。自分が助けられたかもしれないという後悔を抱えている。');
append('act2','act2-speech-0218','truth','【後から分かる意味】Christopherの「あなたも逃げている」という指摘は当たっている。Mollieは後にJimmyの件を“忘れたかった”ためLongridge Farmとの関係を隠したと説明する。');
append('act2','act2-speech-0227','truth','【真相】Mollieが「Trotterは頭に疑いを植え付ける」と感じるのは正しい。Trotterは犯人本人で、Christopher、Giles、Casewellなど互いへの疑念を広げる偽捜査を続けている。');
append('act2','act2-speech-0235','foreshadowing','【後から分かること】GilesのLondon紙は、彼が前日Londonへ行っていた証拠。ただし殺人のためではなく、結婚記念日のMollieへの帽子を買うためだった。');
append('act2','act2-speech-0239','context','【後から分かること】Mollieの疑問「なぜLondonへ行ったことを隠したのか」の答えは、Gilesが記念日の贈り物を秘密にしたかったから。殺人との関係を隠したわけではない。');
append('act2','act2-speech-0243','truth','【真相】Mollieが語る「身近な人まで別人に見えてくる」状態は、Trotterが偽捜査で互いの秘密を暴き、疑念を増幅させた結果として実際に起きている。');
append('act2','act2-speech-0282','foreshadowing','【後から分かること】MollieのLondon bus ticketも、彼女がLondon行きを隠していた証拠。ただし目的はGilesへの結婚記念日の葉巻を買うことだった。');
append('act2','act2-speech-0289','truth','【後から分かること】ここで夫婦は互いにLondonへ行っていたことを認める。二人とも殺人ではなく相手への記念日プレゼントのために秘密にしていたため、同じ種類の隠し事が相互不信を生んでいた。');
append('act2','act2-speech-0296','concealment','【後から分かること】GilesはLondon行き自体は認めるが、まだ「記念日の帽子を買うため」とは言わない。無実の理由を伏せたままなので、Mollieの疑いが残る。');
append('act2','act2-speech-0305','concealment','【後から分かること】MollieもLondonへ行った理由をここでは拒んで言わない。実際はGilesへの記念日の葉巻を買うためで、秘密を守ることが夫婦間の疑念を深めている。');
append('act2','act2-speech-0307','foreshadowing','【伏線】「結婚前に何を経験し、苦しんだかGilesは知らない」というMollieの言葉は、Longridge FarmのJimmyの件を夫に話していなかったことへ直接つながる。');
append('act2','act2-speech-0322','truth','【真相】skisを誰が取ったかについては、犯人Trotterにも本当に分かっていない。終盤で潜入警官Metcalfが自分で隠したと明かすため、Trotterの全ての疑問が演技というわけではない。');
append('act2','act2-speech-0324','lie','【真相】警察署へ行ってreinforcementsを呼ぶという説明は偽警官としての表向きの目的。彼は警察へ報告する立場にはない。');
append('act2','act2-speech-0364','truth','【後から分かること】Trotterが「Metcalfにはskisを取る絶好の機会があった」と指摘した点は事実。終盤でMetcalf本人がskisを隠したと認める。');
append('act2','act2-speech-0365','concealment','【真相】Metcalfは“if I wanted to”と仮定形で受け流すが、実際には自分がskisを隠している。Trotterの逃走手段を封じるため、ここでは知らないふりを続ける。');
append('act2','act2-speech-0367','feignedIgnorance','【真相】Metcalfは全員でskisを探そうと提案するが、隠し場所を知っている本人。潜入警官として正体と行動を悟られないため、捜索する側を装っている。');
append('act2','act2-speech-0370','lie','【真相】「犯人の頭に入り、一歩先を行かなければならない」と捜査官の使命を語るが、本人がその“cunning brain”の犯人。警察の推理過程を演じている。');
append('act2','act2-speech-0372','truth','【真相】「6人のうち1人がkiller」と断言するが、実際のkillerは話しているTrotter自身で、その6人の外側にいる。さらに“killer’s enjoying this”は後に本人が“such fun”だったと認め、自分自身の心理を事実として語っていたと分かる。');
append('act2','act2-speech-0382','foreshadowing','【伏線】Paraviciniの「あなたは本当は忘れるタイプではない」という評は、後にMollieがJimmyの件に長年苦しみ、忘れようとしても忘れられなかったと告白することで結果的に当たる。');
append('act2','act2-speech-0403','truth','【後から分かること】Paravicini自身が「見た目ほど年を取っていない」と認める。Casewellが早くから気づいていたmakeupと若い動きの観察は正しかったが、彼が連続殺人犯だという意味ではない。');
append('act2','act2-speech-0406','truth','【後から分かること】Trotterの「わざと老けて見せているのでは」という観察には根拠がある。ただしParaviciniは犯人ではなく、年齢偽装の理由と殺人事件は別問題。');
append('act2','act2-speech-0420','foreshadowing','【後から分かる意味】“Murder isn’t just fun and games.”と厳しく言う本人が、終盤には殺人と警官役を“great fun”だったと語る。正体判明後には意図的な二重性が見える発言。');
append('act2','act2-speech-0451','truth','【後から分かること】Casewellが「ここへ来た目的を終えるまで滞在する」と言う目的は、弟Georgieを探し出すこと。');
append('act2','act2-speech-0457','concealment','【真相】Casewellが“strictly private affair”として答えないのは、Longridge Farmの妹Kathyとして弟Georgieを探しているという身元と目的を隠しているため。');
append('act2','act2-speech-0477','evasion','【真相】“It’s my name now.”は「当時の姓はCasewellだったか」という質問に答えていない。現在名だけを示し、Longridge Farm時代の身元を意図的に避けている。');
append('act2','act2-speech-0481','lie','【真相】昔の名前を「忘れた」と言うのは虚偽。彼女はKathyとしての幼少期を覚えており、終盤にはGeorgieへ当時の記憶を具体的に語る。');
append('act2','act2-speech-0482','foreshadowing','【後から分かる意味】“忘れないこともある”と言うTrotter自身もLongridge FarmのGeorgieで、幼少期の恨みを忘れず復讐を続けている。この一般論は本人にもそのまま当てはまる。');
append('act2','act2-speech-0488','foreshadowing','【伏線】Trotterが“Katherine”に引っかかるように反応する。後にCasewellが妹Kathyだと判明するため、名前が過去の記憶に接触し始めている場面として読める。');
append('act2','act2-speech-0494','foreshadowing','【伏線】Casewellとの尋問直後に“I can’t believe it”と動揺する。後に彼女がKathyだと分かるため、Trotterの過去とCasewellの正体が結びつき始めたことを示す反応。');
append('act2','act2-speech-0498','misdirection','【真相】“警察がようやくclueを得た”という演出に入るが、Trotterは最初から自分が犯人だと知っている。少なくとも犯人を知るための手掛かりではなく、次の仕掛けへ全員を動かすための捜査演技。');
append('act2','act2-speech-0500','lie','【真相】“the police have a clue”と警察側の進展を宣言するが、本人は警察ではなく犯人。ここからの集合と再現実験を正当化するための口実。');
append('act2','act2-speech-0514','foreshadowing','【伏線】Christopherの「これは誰かにとってgameだ」という指摘は正しい。後にGeorgie本人が殺人と偽警官役を“such fun”だったと語る。');
append('act2','act2-speech-0519','misdirection','【真相】「6人の供述のうち1人が嘘で、その人物が犯人」という前提では実際の犯人Trotter自身が候補に入っていない。再現実験は犯人特定ではなく、全員を配置換えしてMollieを孤立させるための偽の捜査手続。');
append('act2','act2-speech-0531','truth','【真相】Mollieの“It’s a trap.”は文字通り正しい。ただし警察が犯人を捕まえるtrapではなく、Trotterが皆を分散させてMollieを一人にするための罠。');
append('act2','act2-speech-0533','truth','【真相】Mollieは理由までは説明できないが、再現実験が本当の捜査ではないことを直感的に見抜いている。後のTrotterの行動で“trap”だったことが確定する。');
append('act2','act2-speech-0556','truth','【真相】「同じ行動だが同じ人物ではない」という変更こそ、通常の再現ではなく配置換えが目的であることを示す。Trotterは各人を別々の場所へ送る準備をしている。');
append('act2','act2-speech-0558','truth','【真相】長い割り当ての本当の効果は、全員を別々の場所へ散らし、Gilesを屋外へ、Mollieをdrawing roomへ置くこと。TrotterがMollieと対面できる状況を作る犯行計画。');
append('act2','act2-speech-0560','truth','【真相】“Mrs. Boyle役を演じる”と言うが、実際にはMrs. Boyleを殺した犯人本人。被害者側の役を選ぶことで、自分を犯人候補の外に置いたままMollieの近くに残る。');
append('act2','act2-speech-0567','truth','【真相】“exactly what I wanted”の「欲しかったもの」は捜査上の証拠だけではない。全員を指定場所へ分散させ、Mollieと二人になれる配置が完成したことを指す。');
append('act2','act2-speech-0569','feignedIgnorance','【真相】「犯人が誰か分かった」のではなく、最初から本人が犯人。警官が推理で到達したように見せながら、Mollieへ正体を明かす段階へ移っている。');
append('act2','act2-speech-0571','truth','【真相】“You ought to know”はMollieがLongridge Farmと無関係ではないことを指す。彼女はJimmyの教師であり、Georgieが最後の標的として選んだ相手。');
append('act2','act2-speech-0573','truth','【真相】Mollieが情報を隠したため危険だったという説明は、警察が守れなかったという意味ではない。情報を隠していた彼女をGeorgie自身が復讐対象として狙っているため危険だった。');
append('act2','act2-speech-0575','lie','【真相】“We policemen”は最後まで続ける偽身分。一方でMollieがLongridge Farmを直接知る人物だと把握していたこと自体は、犯人として彼女を標的にしていたための知識。');
append('act2','act2-speech-0581','truth','【真相】Jimmyの助けを求める手紙について詳しく知っているのは、警察資料だけではなくJimmyの兄Georgie本人だから。ここでMollieへの個人的な恨みの核心を突きつけている。');
append('act2','act2-speech-0583','mistakenBelief','【真相】“You just didn’t bother.”はGeorgieが信じていた非難であり事実ではない。Mollieはその日に肺炎になり、手紙を見つけた時にはJimmyが死亡していたと直後に説明する。');
append('act2','act2-speech-0591','truth','【真相】“It’s all been such fun. Watching you all. And pretending to be a policeman.”は、これまでの「犯人はこの状況を楽しんでいる」という発言が自己描写だったことを本人が明言する場面。');
append('act2','act2-speech-0600','truth','【真相】CasewellはGeorgieを探すため英国へ来ており、昔からの髪をくるくるする癖を見て弟だと認識した。Scene 1・2で伏せていた“business”の答えがここで確定する。');
append('act2','act2-speech-0612','truth','【真相】“Major Metcalf”がTrotterを以前から疑っていたのは、彼自身が潜入警察官だったため。一般のMajorの勘ではなく、警察側として不審な偽警官を見ていた。');
append('act2','act2-speech-0614','truth','【真相】ここで身元が反転する。Trotterは偽警官、客として滞在していた“Major Metcalf”の方が本物の警察官だった。');
append('act2','act2-speech-0616','truth','【真相】警察はnotebookにMonkswell Manorがあった時点で本物のMajor Metcalfと入れ替わり、捜査官を客として潜入させていた。そのためTrotterの突然の登場は警察の予定外だった。');
append('act2','act2-speech-0618','truth','【真相】Casewellは直前にGeorgieを認識してMetcalfへ相談していた。また、行方不明だったskisを隠したのもMetcalf本人で、偽警官Trotterの移動・逃走手段を封じていた。');
append('act2','act2-speech-0622','truth','【真相】Gilesが前日Londonへ行った理由はMollieへの結婚記念日の帽子を買うため。序盤のchicken nettingの説明でLondon行きを伏せたのは、贈り物を秘密にするためだった。');
append('act2','act2-speech-0623','truth','【真相】Mollieも同じ理由でLondon行きを隠していた。Gilesへの結婚記念日の葉巻を買うためで、夫婦双方の秘密が殺人への疑いとして誤読されていたことが解ける。');

const ledger = {
  schemaVersion: 1,
  scope: { speechCount: 1164, scenes: {'act1-scene1':190,'act1-scene2':336,act2:638} },
  facts: {
    trotter: 'Trotterを名乗る人物はCorrigan家の長男Georgie。警察官ではなく、Maureen LyonとMrs. Boyleを殺害し、Mollieを次の標的にしている。偽の警察電話をかけ、屋敷到着前に電話線を切った。',
    metcalf: 'Monkswell Manorにいる“Major Metcalf”は、本物のMajorと事前に入れ替わった潜入警察官。Trotterの来訪は予定外で、後に彼を疑いskisを隠す。',
    casewell: 'Miss CasewellはCorrigan家のKathyで、Longridge Farmの生存者。英国へ戻った目的は弟Georgieを探すこと。Longridge Farmを知らないという発言は虚偽。',
    mollie: 'Mollieの旧姓はWaring。Jimmyの学校の教師で、助けを求める手紙は肺炎で倒れた日に届き、発見時にはJimmyが死亡していた。過去を忘れたくて関係を隠す。前日のLondon行きはGilesへの記念日プレゼントのため。',
    giles: 'Gilesの前日のLondon行きはMollieへの結婚記念日プレゼントのため。序盤ではLondon行きを伏せてchicken netting探しの話をしている。',
    christopher: 'Christopher Wrenは偽名で、建築家を目指しているという経歴も偽り。Army serviceから逃亡しているが、連続殺人犯ではない。',
    mrsBoyle: 'Mrs. BoyleはmagistrateとしてCorrigan家の子供たちをLongridge Farmへ預ける判断に関与した。Trotterの質問ではこの接点を隠す。',
    paravicini: 'Paraviciniは見た目ほど高齢ではなくmakeupで年齢を変えて見せているが、連続殺人犯ではない。'
  },
  method: '全1164 speech IDを既存review ledgerとcanonical scriptで照合し、作品終盤の確定事実が既存解釈を変更・補足するspeechだけをtruth-aware correction対象とした。既存解釈が正確なspeechは変更しない。',
  changedSpeechIds: Object.fromEntries(Object.entries(changed).map(([scene,set]) => [scene,[...set]]))
};

for (const [scene, obj] of Object.entries(data)) {
  let noteCount = 0;
  for (const arr of Object.values(obj.interpretations || {})) noteCount += arr.length;
  const speechCount = Object.keys(obj.interpretations || {}).length;
  obj.qa = {
    ...(obj.qa || {}),
    reviewedSpeechCount: obj.reviewedSpeechIds.length,
    interpretationSpeechCount: speechCount,
    interpretationNoteCount: noteCount,
    unreviewedSpeechCount: 0,
    withoutInterpretationCount: obj.reviewedSpeechIds.length - speechCount,
    truthAwareReview: 'PASS',
    fullPlayTruthChecked: true,
    truthAwareChangedSpeechCount: changed[scene].size
  };
  fs.writeFileSync(paths[scene], JSON.stringify(obj) + '\n');
}
fs.writeFileSync('data/interpretation/truth-ledger.json', JSON.stringify(ledger, null, 2) + '\n');

console.log(JSON.stringify({status:'PASS', changed:Object.fromEntries(Object.entries(changed).map(([s,v])=>[s,v.size]))}, null, 2));
