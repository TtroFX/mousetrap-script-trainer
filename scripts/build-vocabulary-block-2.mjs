import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const script = read('mousetrap_script_data.json');
const oldVocab = read('mousetrap_line_vocabulary.json');
const oldDict = read('mousetrap_word_dictionary.json');
const b1Dict = read('data/vocabulary-rebuild/block-1-dictionary.json').entries || {};
const b1Supp = read('data/vocabulary-rebuild/block-1-dictionary-supplement.json').entries || {};
const sceneId = 'act1-scene2';
const first = 1;
const last = 178;
const speeches = script[sceneId].speeches.slice(first - 1, last);
const speechById = new Map(speeches.map(s => [s.id, s]));

const norm = v => String(v || '').toLowerCase().normalize('NFKC').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const key = (id, surface) => `${id}|${norm(surface)}`;

const lemmaRewrite = new Map([
  [key('act1-scene2-speech-0085', 'implicitly'), 'implicitly'],
  [key('act1-scene2-speech-0034', 'Got the bit between their teeth'), "get the bit between one's teeth"],
  [key('act1-scene2-speech-0129', 'just'), 'just'],
]);

const contextOverride = new Map(Object.entries({
  [key('act1-scene2-speech-0017', 'Unbalanced')]: 'Mrs. BoyleがChristopherを「精神的に不安定なのでは」と決めつけている侮蔑的な評価。医学的な診断を述べているわけではない。',
  [key('act1-scene2-speech-0018', 'lunatic')]: 'Major MetcalfがMrs. Boyleの疑いに合わせて「精神病院から逃げてきたと思うのか」と皮肉っぽく返している。Christopherについての事実ではない。',
  [key('act1-scene2-speech-0034', 'Got the bit between their teeth')]: 'ここでは「下の階級の人々が自分たちの意思で動くようになり、雇う側が思い通りに扱えなくなった」という比喩。CasewellはMrs. Boyleの階級意識をからかっている。',
  [key('act1-scene2-speech-0042', 'business')]: 'Casewellが英国で片づける必要のある個人的な用事・案件を指す。何の用事なのかはこの時点では明かしていない。',
  [key('act1-scene2-speech-0047', 'Would you mind')]: '形式上は丁寧な依頼だが、Mrs. Boyleがラジオの音を下げるようCasewellに求める苦情・要求。',
  [key('act1-scene2-speech-0060', 'Tactics')]: 'ラジオを利用してMrs. Boyleを暖かい椅子から追い出し、自分が座るための「作戦」という意味。',
  [key('act1-scene2-speech-0062', 'pinched')]: 'ここでは椅子を本当に盗んだのではなく、Mrs. Boyleが「一番いい椅子を先に取っていた」という口語的な意味。',
  [key('act1-scene2-speech-0077', 'get through')]: 'ここでは電話がつながることではなく、大雪で道路を物理的に通り抜けてMonkswell Manorまで来ること。',
  [key('act1-scene2-speech-0085', 'implicitly')]: 'ここでは「暗黙のうちに」ではなく、「Sergeant Trotterの指示に完全に従い、勝手に変えないで」という古めの用法。',
  [key('act1-scene2-speech-0093', 'go through')]: 'ここでは缶詰の備蓄を「経験する」のではなく、雪で閉じ込められている間に使い果たしてしまうこと。',
  [key('act1-scene2-speech-0099', 'extraordinary')]: 'Mrs. BoyleはChristopherを「並外れて優秀」と褒めているのではなく、服装や態度が非常に変わっていて怪しい、と批判している。',
  [key('act1-scene2-speech-0110', 'turn away')]: '宿泊を求める正当な旅行者を、宿側が受け入れず追い返すこと。',
  [key('act1-scene2-speech-0141', 'ruddy')]: 'Gilesが質の悪いコークスへの苛立ちを込めて使う、比較的弱い罵り・強調語。「赤い」という意味ではない。',
  [key('act1-scene2-speech-0143', 'banked up')]: 'ここでは暖炉の燃料を積む意味ではなく、雪が道路脇・道路上に高く吹きだまって通行を妨げていること。',
  [key('act1-scene2-speech-0171', 'business')]: '商売ではなく、TrotterがMonkswell Manorへ来た警察上の本題・正式な用件。',
  [key('act1-scene2-speech-0177', 'protection')]: '犯罪の処罰ではなく、誰かが危険にさらされる可能性があるため警察が守る必要がある、という意味。この時点では誰を何から守るのかはまだ説明されていない。',
  [key('act1-scene2-speech-0178', 'protection')]: 'Mollieが「警察の保護？」と驚いて聞き返している。具体的な危険の内容はまだ知らされていない。'
}));

const contextAdditions = {
  'act1-scene2-speech-0012': [
    {surface:"old tabbies' delight", lemma:"old tabbies' delight", contextMeaning:'Major MetcalfがMrs. Boyleの期待する、年配の女性客が喜びそうな保守的で快適な宿をからかって表現している。Mrs. Boyle自身への軽い皮肉。'}
  ],
  'act1-scene2-speech-0018': [
    {surface:'escaped from a lunatic asylum', lemma:'escape from a lunatic asylum', contextMeaning:'Mrs. Boyleの「Christopherは精神的におかしい」という決めつけをMajor Metcalfが冗談めかして誇張している。事実を示す発言ではない。'}
  ],
  'act1-scene2-speech-0036': [
    {surface:'not a Red ― just pale pink', lemma:'not a Red, just pale pink', contextMeaning:'政治色を色でたとえた冗談。「共産主義者というほどではなく、せいぜい少し左寄り」という自己説明。'}
  ],
  'act1-scene2-speech-0055': [
    {surface:'hunt me down', lemma:'hunt someone down', contextMeaning:'Mrs. BoyleがChristopherを本当に追跡しているのではなく、「どこへ行っても現れて自分をにらむ」と大げさに不満を言っている。'}
  ],
  'act1-scene2-speech-0058': [
    {surface:'served its purpose', lemma:'serve its purpose', contextMeaning:'ラジオを大きくしてMrs. Boyleを別室へ行かせ、Casewellが暖かい椅子を取るという作戦が目的を果たした、という意味。'}
  ],
  'act1-scene2-speech-0064': [
    {surface:'Not a hope', lemma:'not a hope', contextMeaning:'雪がひどいため、Mrs. Boyleが今すぐ宿を出ていける可能性は「まったくない」という口語表現。'}
  ],
  'act1-scene2-speech-0066': [
    {surface:'lots of things may have happened', lemma:'a lot may happen', contextMeaning:'雪が解けるまでに状況が大きく変わっているかもしれない、という意図的に不穏で曖昧な言い方。何が起こるかは明言していない。'}
  ],
  'act1-scene2-speech-0080': [
    {surface:'Serving liquor without a licence', lemma:'serve liquor without a licence', contextMeaning:'Casewellが突然の警察電話を、宿が無許可で酒を出した程度の問題ではないかと冗談で推測している。実際の容疑を示しているわけではない。'}
  ],
  'act1-scene2-speech-0087': [
    {surface:'those nylons from Gibraltar', lemma:'nylons from Gibraltar', contextMeaning:'Mollieが警察電話の理由を不安になって探し、Gibraltarで入手したナイロン製品が何か問題だったのかと推測している。詳細はこの場面では説明されない。'}
  ],
  'act1-scene2-speech-0092': [
    {surface:'tinpot regulation', lemma:'tinpot regulation', contextMeaning:'Gilesが、宿を経営する上で知らずに破ったかもしれない「くだらない細かな役所の規則」と軽蔑して呼んでいる。'}
  ],
  'act1-scene2-speech-0105': [
    {surface:'fishy story', lemma:'fishy story', contextMeaning:'Mrs. BoyleがChristopherの名前と職業の説明を「どうも怪しい、信用しにくい話だ」と疑っている。魚に関する意味ではない。'}
  ],
  'act1-scene2-speech-0112': [
    {surface:'sitting on the Bench', lemma:'sit on the Bench', contextMeaning:'ここではベンチに座ることではなく、Mrs. Boyleが治安判事として法廷で職務をしていたこと。'}
  ],
  'act1-scene2-speech-0114': [
    {surface:'talk of the devil', lemma:'talk of the devil', contextMeaning:'噂をしていた本人Paraviciniがちょうど現れたことを指す慣用表現。Paraviciniは自分を「devil」に重ねて芝居がかって言っている。'}
  ],
  'act1-scene2-speech-0122': [
    {surface:'makes them easy', lemma:'make things easy', contextMeaning:'雪が「物事を簡単にする」とParaviciniが意味深に言う。何が容易になるのかをわざと説明せず、不穏さを作っている。'}
  ],
  'act1-scene2-speech-0128': [
    {surface:'references', lemma:'reference', contextMeaning:'ここでは一般的な「参照」ではなく、宿泊客の身元・信用を確認するための紹介状や信用照会のこと。'}
  ],
  'act1-scene2-speech-0130': [
    {surface:'sleep under your roof', lemma:'under someone’s roof', contextMeaning:'同じ屋根の下で眠る、つまり自分の宿・家に泊めている人々を指す。'},
    {surface:'fugitive from justice', lemma:'fugitive from justice', contextMeaning:'法の追及から逃げている逃亡者。Paraviciniは自分もそうかもしれないと仮定してMollieを不安にさせているだけで、告白ではない。'}
  ],
  'act1-scene2-speech-0149': [
    {surface:'enjoying themselves at winter sports', lemma:'enjoy oneself at winter sports', contextMeaning:'Mrs. Boyleが、警官がスキーで来たことを「税金で冬のスポーツを楽しんでいる」と皮肉っている。Trotterは遊びに来たのではない。'}
  ],
  'act1-scene2-speech-0152': [
    {surface:'hearty', lemma:'hearty', contextMeaning:'Christopherが、雪まみれで元気そうなTrotterを「いかにも健康的で快活そう」と少しからかう調子で評している。'}
  ],
  'act1-scene2-speech-0153': [
    {surface:'A policeman ― skiing!', lemma:'a policeman skiing', contextMeaning:'Mrs. Boyleが、警察官がスキーで現れたことを非常識・滑稽だと感じて驚いている。'}
  ],
  'act1-scene2-speech-0158': [
    {surface:'hearty', lemma:'hearty', contextMeaning:'Christopherが先ほどと同じくTrotterの健康的で活動的な印象をからかい気味に繰り返している。'}
  ],
  'act1-scene2-speech-0164': [
    {surface:'telephone is dead', lemma:'dead telephone', contextMeaning:'電話機が壊れたというより、回線が切れて外部へ電話できない状態。'}
  ],
  'act1-scene2-speech-0167': [
    {surface:'cut off', lemma:'cut off', contextMeaning:'雪で道路が遮断され、さらに電話も使えなくなり、外部との移動・通信の両方が断たれた状態。'}
  ],
  'act1-scene2-speech-0170': [
    {surface:'sleuth', lemma:'sleuth', contextMeaning:'Trotterを探偵役のように芝居がかって呼ぶ、Christopherの冗談めいた表現。'}
  ],
  'act1-scene2-speech-0171': [
    {surface:'get to business', lemma:'get to business', contextMeaning:'雑談や到着の処理を終えて、警察官として来た本来の用件の説明を始めること。'}
  ]
};

const b1plusAdditions = {
  'act1-scene2-speech-0001': [{surface:'dishonest', lemma:'dishonest'}],
  'act1-scene2-speech-0002': [{surface:'homemade', lemma:'homemade'}],
  'act1-scene2-speech-0011': [{surface:'comfortable', lemma:'comfortable'}],
  'act1-scene2-speech-0017': [{surface:'mentally', lemma:'mentally'}],
  'act1-scene2-speech-0024': [{surface:'exercise', lemma:'exercise'}],
  'act1-scene2-speech-0027': [{surface:'housework', lemma:'housework'}],
  'act1-scene2-speech-0033': [{surface:'responsibilities', lemma:'responsibility'}],
  'act1-scene2-speech-0035': [{surface:'Socialist', lemma:'socialist'}],
  'act1-scene2-speech-0036': [{surface:'politics', lemma:'politics'}],
  'act1-scene2-speech-0047': [{surface:'distracting', lemma:'distracting'}],
  'act1-scene2-speech-0058': [{surface:'purpose', lemma:'purpose'}],
  'act1-scene2-speech-0063': [{surface:'annoy', lemma:'annoy'}],
  'act1-scene2-speech-0067': [{surface:'peaceful', lemma:'peaceful'}, {surface:'pure', lemma:'pure'}],
  'act1-scene2-speech-0072': [{surface:'fear', lemma:'fear'}],
  'act1-scene2-speech-0076': [{surface:'disappoint', lemma:'disappoint'}],
  'act1-scene2-speech-0083': [{surface:'confident', lemma:'confident'}],
  'act1-scene2-speech-0085': [{surface:'instructions', lemma:'instruction'}],
  'act1-scene2-speech-0094': [{surface:'serious', lemma:'serious'}],
  'act1-scene2-speech-0099': [{surface:'manners', lemma:'manner'}],
  'act1-scene2-speech-0103': [{surface:'educated', lemma:'educated'}],
  'act1-scene2-speech-0107': [{surface:'advice', lemma:'advice'}],
  'act1-scene2-speech-0120': [{surface:'upset', lemma:'upset'}],
  'act1-scene2-speech-0121': [{surface:'difficult', lemma:'difficult'}],
  'act1-scene2-speech-0128': [{surface:'trusting', lemma:'trusting'}],
  'act1-scene2-speech-0130': [{surface:'thief', lemma:'thief'}, {surface:'robber', lemma:'robber'}],
  'act1-scene2-speech-0140': [{surface:'sergeant', lemma:'sergeant'}],
  'act1-scene2-speech-0146': [{surface:'Detective', lemma:'detective'}, {surface:'Sergeant', lemma:'sergeant'}, {surface:'skis', lemma:'ski'}],
  'act1-scene2-speech-0149': [{surface:'police force', lemma:'police force'}],
  'act1-scene2-speech-0156': [{surface:'sergeant', lemma:'sergeant'}],
  'act1-scene2-speech-0166': [{surface:'line', lemma:'telephone line'}],
  'act1-scene2-speech-0173': [{surface:'necessary', lemma:'necessary'}],
  'act1-scene2-speech-0177': [{surface:'matter', lemma:'matter'}]
};

const manualDefinitions = {
  "old tabbies' delight": {pos:'名詞句', meaning:'年配の女性たちが特に喜びそうな場所・もの、という古風でからかいを含む表現。', tags:['British','dated','informal']},
  'escape from a lunatic asylum': {pos:'動詞句', meaning:'精神科施設を指す古い表現の場所から逃げ出す。現代では表現自体が不適切とされることがある。', tags:['dated','offensive-historical']},
  'not a Red, just pale pink': {pos:'定型表現', meaning:'政治的立場を色で表し、共産主義者ではないが穏健な左派寄りだと冗談めかして示す表現。', tags:['political-metaphor','dated']},
  'hunt someone down': {pos:'句動詞', meaning:'人を執拗に探し出す、追跡して見つける。'},
  'serve its purpose': {pos:'定型表現', meaning:'意図された目的・役割を果たす。'},
  'not a hope': {pos:'定型表現', meaning:'可能性がまったくない、望みがない。', tags:['informal']},
  'a lot may happen': {pos:'定型表現', meaning:'その間に多くのこと・大きな変化が起こる可能性がある。'},
  'serve liquor without a licence': {pos:'動詞句', meaning:'必要な許可を得ずに酒類を提供する。'},
  'nylons from Gibraltar': {pos:'名詞句', meaning:'Gibraltarで入手したナイロン製品を指す表現。', tags:['period-culture']},
  'tinpot regulation': {pos:'名詞句', meaning:'取るに足りない、くだらないと見なされる規則。', tags:['informal','derogatory']},
  'fishy story': {pos:'名詞句', meaning:'怪しく信用しにくい話。', tags:['informal']},
  'sit on the Bench': {pos:'動詞句', meaning:'裁判官・治安判事として法廷で職務を行う。', tags:['legal']},
  'talk of the devil': {pos:'慣用表現', meaning:'噂をしていた本人がちょうど現れた時に使う表現。'},
  'make things easy': {pos:'動詞句', meaning:'物事を容易にする、やりやすくする。'},
  "under someone’s roof": {pos:'定型表現', meaning:'人の家・建物の中で生活・宿泊して。'},
  'fugitive from justice': {pos:'名詞句', meaning:'法の追及・逮捕から逃れている人。', tags:['legal']},
  'enjoy oneself at winter sports': {pos:'動詞句', meaning:'スキーなどの冬季スポーツを楽しむ。'},
  'hearty': {pos:'形容詞', meaning:'元気で活力があり、健康的・陽気な印象の。'},
  'a policeman skiing': {pos:'名詞句', meaning:'スキーをしている警察官を指す表現。'},
  'dead telephone': {pos:'名詞句', meaning:'回線や接続が機能せず、通話できない電話。'},
  'cut off': {pos:'句動詞・形容詞', meaning:'つながり・交通・通信などを断つ、または断たれて孤立した。'},
  'sleuth': {pos:'名詞', meaning:'探偵、捜査をする人。しばしば冗談めいた語。', tags:['informal']},
  'get to business': {pos:'定型表現', meaning:'雑談などを終えて本題・正式な用件に入る。'},
  'implicitly': {pos:'副詞', meaning:'暗に、明示せずに。また古い・限定的用法で、完全に・無条件に。'},
  'telephone line': {pos:'名詞', meaning:'電話通信を伝える回線。'},
  'police force': {pos:'名詞', meaning:'警察組織、警察官全体。'},
  'ski': {pos:'名詞・動詞', meaning:'雪上を滑走するための細長い板。またスキーで滑る。'},
  'sergeant': {pos:'名詞', meaning:'警察・軍隊などの階級の一つ。英国警察では巡査より上の階級。'},
  'detective': {pos:'名詞・形容詞', meaning:'犯罪を捜査する刑事・探偵。捜査の。'},
  'matter': {pos:'名詞', meaning:'問題、事柄、案件。'},
  'distracting': {pos:'形容詞', meaning:'注意をそらす、集中を妨げる。'},
  'trusting': {pos:'形容詞', meaning:'人を疑わず信じやすい。'}
};

function findOldDictionaryEntry(lemma) {
  const target = norm(lemma);
  const k = Object.keys(oldDict).find(x => norm(x) === target);
  return k ? oldDict[k] : null;
}

function neutralEntry(lemma) {
  if (b1Dict[lemma]) return b1Dict[lemma];
  if (b1Supp[lemma]) return b1Supp[lemma];
  if (manualDefinitions[lemma]) return manualDefinitions[lemma];
  const old = findOldDictionaryEntry(lemma);
  if (!old) return null;
  let meaning = String(old.coreMeaning || '').trim();
  if (!meaning || /劇中/.test(meaning)) {
    meaning = String(old.meaning || '').trim();
  }
  if (!meaning || /劇中/.test(meaning)) return null;
  const out = { pos: old.pos || '未分類', meaning };
  if (Array.isArray(old.tags) && old.tags.length) out.tags = old.tags;
  return out;
}

const contextLines = {};
const thresholdLines = {};
const pairSeen = new Set();
const selectedLemmas = new Set();

function addContext(speechId, item) {
  if (!speechById.has(speechId)) throw new Error(`Context addition outside block: ${speechId}`);
  const surface = String(item.surface || '').trim();
  let lemma = String(item.lemma || '').trim();
  const rewrite = lemmaRewrite.get(key(speechId, surface));
  if (rewrite) lemma = rewrite;
  const p = `${speechId}|${norm(surface)}|${norm(lemma)}`;
  if (pairSeen.has(p)) return;
  pairSeen.add(p);
  const contextMeaning = item.contextMeaning ?? contextOverride.get(key(speechId, surface)) ?? '';
  (contextLines[speechId] ||= []).push({ surface, lemma, contextMeaning });
  selectedLemmas.add(lemma);
}

for (const speech of speeches) {
  for (const item of oldVocab[speech.id] || []) addContext(speech.id, item);
  for (const item of contextAdditions[speech.id] || []) addContext(speech.id, item);
}

function addThreshold(speechId, item) {
  if (!speechById.has(speechId)) throw new Error(`Threshold addition outside block: ${speechId}`);
  const surface = String(item.surface || '').trim();
  const lemma = String(item.lemma || '').trim();
  const p = `${speechId}|${norm(surface)}|${norm(lemma)}`;
  if (pairSeen.has(p)) return;
  pairSeen.add(p);
  (thresholdLines[speechId] ||= []).push({ surface, lemma, contextMeaning: '' });
  selectedLemmas.add(lemma);
}
for (const [speechId, entries] of Object.entries(b1plusAdditions)) for (const item of entries) addThreshold(speechId, item);

const dictionaryEntries = {};
const missing = [];
for (const lemma of [...selectedLemmas].sort((a,b)=>a.localeCompare(b,'en'))) {
  const entry = neutralEntry(lemma);
  if (!entry) missing.push(lemma);
  else dictionaryEntries[lemma] = entry;
}
if (missing.length) throw new Error(`Missing neutral dictionary definitions: ${missing.join(', ')}`);

const contextFile = {
  schemaVersion: 1,
  blockId: 'block-2',
  sceneId,
  processedSpeechRange: [first, last],
  processedSpeechCount: last - first + 1,
  policy: {
    contextFirst: true,
    threshold: 'Conservatively include vocabulary plausibly at CEFR B1 or above; when level is uncertain, include rather than exclude.',
    alsoInclude: ['idiom','phrasal verb','British/dated usage','culture-specific expression','context-sensitive lower-level expression'],
    contextMeaningRule: 'Write contextMeaning only when the local dramatic meaning, pragmatic force, idiomatic value, euphemism, irony, social force, period usage or figurative sense materially differs from a neutral dictionary gloss. Otherwise use an empty string.',
    outline: 'data/mousetrap_context_outline.json#outlines.block-2',
    uiFuture: 'A non-empty contextMeaning will later trigger highlight in addition to the normal underline. UI is intentionally not modified in this block.'
  },
  lines: contextLines
};
const thresholdFile = {
  schemaVersion: 1,
  blockId: 'block-2',
  sceneId,
  purpose: 'Second-pass B1+ coverage additions after context-first selection. Context-specific entries belong in block-2-line-vocabulary.json.',
  selectionPolicy: {
    baseline: 'CEFR-aligned learner vocabulary; conservatively include plausible B1+ items and prefer over-inclusion to omission.',
    contextMeaning: 'Always empty in this file.'
  },
  lines: thresholdLines
};
const dictionaryFile = {
  schemaVersion: 1,
  blockId: 'block-2',
  purpose: 'Deduplicated neutral dictionary for the union of Block 2 context-first vocabulary and conservative B1+ additions.',
  definitionPolicy: { neutral: true, noContextMeaning: true, learnerFriendlyJapanese: true, oneEntryPerLemma: true },
  entries: dictionaryEntries
};
const supplementFile = { schemaVersion: 1, blockId: 'block-2', purpose: 'Reserved for definitions that cannot be represented in the main generated dictionary.', entries: {} };

write('data/vocabulary-rebuild/block-2-line-vocabulary.json', contextFile);
write('data/vocabulary-rebuild/block-2-b1plus-coverage.json', thresholdFile);
write('data/vocabulary-rebuild/block-2-dictionary.json', dictionaryFile);
write('data/vocabulary-rebuild/block-2-dictionary-supplement.json', supplementFile);
console.log(JSON.stringify({ speeches: speeches.length, contextLines: Object.keys(contextLines).length, thresholdLines: Object.keys(thresholdLines).length, lemmas: selectedLemmas.size }, null, 2));
