import fs from 'node:fs';
import crypto from 'node:crypto';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const write = (path, value) => fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const sha256 = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const key = value => String(value || '').trim().toLowerCase();

const DICT_PATH = 'mousetrap_word_dictionary.json';
const VOCAB_PATH = 'mousetrap_line_vocabulary.json';
const SCRIPT_PATH = 'mousetrap_script_data.json';
const CONTRACT_PATH = 'data/canonical-production-contract.json';
const MANIFEST_PATH = 'data/canonical-integration-manifest.json';
const REPORT_PATH = 'data/vocabulary-semantic-repair-report.json';

const dict = read(DICT_PATH);
const vocab = read(VOCAB_PATH);
const script = read(SCRIPT_PATH);

const speechById = new Map();
for (const scene of Object.values(script)) {
  for (const speech of scene?.speeches || []) speechById.set(speech.id, speech);
}
if (speechById.size !== 1164) throw new Error(`speech corpus mismatch: ${speechById.size}/1164`);

const dictKeyByLemma = new Map(Object.keys(dict).map(k => [key(k), k]));
const changedLemmas = new Set();

function applyDictionaryFix(lemma, patch) {
  const dictKey = dictKeyByLemma.get(key(lemma));
  if (!dictKey) throw new Error(`dictionary entry not found: ${lemma}`);
  const entry = dict[dictKey];
  Object.assign(entry, patch);
  if (patch.meaning) entry.coreMeaning = patch.meaning;
  if (patch.coreMeaning) entry.meaning = patch.coreMeaning;
  if (entry.meaning !== entry.coreMeaning) throw new Error(`core/meaning divergence after repair: ${lemma}`);
  changedLemmas.add(key(lemma));
}

applyDictionaryFix('cross', {
  pos: '形容詞・動詞・名詞',
  forms: 'cross · crosses · crossed · crossed · crossing',
  meaning: '【形】\n不機嫌な、怒った。\n【動】\n① 横切る、渡る\n② 交差する。\n【名】\n十字形、十字架。',
  tags: Array.from(new Set([...(dict[dictKeyByLemma.get('cross')].tags || []), 'polysemy', 'stage-direction']))
});

applyDictionaryFix('concerned', {
  pos: '形容詞',
  forms: 'concerned（形容詞。concern の過去分詞形に由来）',
  meaning: '【形】\n① 心配している、気にかけている\n② 関係している、関与している、該当する。',
  tags: Array.from(new Set([...(dict[dictKeyByLemma.get('concerned')].tags || []), 'polysemy', 'context']))
});

const unclassifiedFixes = {
  'hell': { pos: '名詞・強意表現', meaning: '【名】\n地獄；比喩的に、非常につらい状態。\n【強意表現】\n口語で、驚き・怒りなどを強める。' },
  'whilst': { pos: '接続詞', meaning: '【接】\n～する間に、～である一方。while に相当する英国英語。' },
  'unknown': { pos: '形容詞', meaning: '【形】\n知られていない、正体・詳細が不明な。' },
  'bear': { pos: '動詞', meaning: '【動】\n苦痛・困難・責任などに耐える、受け止める。' },
  'guilty': { pos: '形容詞', meaning: '【形】\n犯罪・過失などについて罪がある、有罪の。' },
  'possibly': { pos: '副詞', meaning: '【副】\n① もしかすると\n② 可能な限り。否定語とともに、強い不可能を表すことがある。' },
  'chicken wire': { pos: '名詞', meaning: '【名】\n鶏小屋などの囲いに使う、細い金属線でできた網状の金網。' },
  'pretend': { pos: '動詞', meaning: '【動】\n事実ではないことを事実であるように装う、ふりをする。' },
  'countryside': { pos: '名詞', meaning: '【名】\n都市部ではない田園・地方一帯。' },
  'doubt': { pos: '動詞・名詞', meaning: '【動】\n確かではないと思う、疑う。\n【名】\n疑い、疑念。' },
  'trust': { pos: '動詞・名詞', meaning: '【動】\n信頼する、信用する。\n【名】\n信頼、信用。' },
  'interrupt': { pos: '動詞', meaning: '【動】\n会話・行動などを途中で遮る、中断させる。' },
  'loose': { pos: '形容詞', meaning: '【形】\n固定・拘束されていない、ゆるんだ；人・動物が逃げ出して自由になった。' },
  'safety': { pos: '名詞', meaning: '【名】\n危険がなく安全であること、安全。' },
  'prepared': { pos: '形容詞', meaning: '【形】\n① 準備ができた\n② ～する覚悟・意思がある。' },
  'dare': { pos: '動詞・助動詞的用法', meaning: '【動】\n勇気を出して～する、あえて～する。\n【助動詞的用法】\nHow dare ...? で「よくも～できるものだ」。' },
  'attract': { pos: '動詞', meaning: '【動】\n人の関心・好意などを引きつける。' },
  'admit': { pos: '動詞', meaning: '【動】\n事実・非などを認める。' },
  'fool': { pos: '名詞', meaning: '【名】\n愚かな人、ばかなことをする人。' },
  'all of a sudden': { pos: '副詞句', meaning: '【副詞句】\n突然、不意に。' },
  'poet': { pos: '名詞', meaning: '【名】\n詩を書く人、詩人。' },
  'annoyed': { pos: '形容詞', meaning: '【形】\nいら立った、腹を立てた。' },
  'thank goodness': { pos: '間投詞的定型表現', meaning: '【定型表現】\n安堵や感謝を表して「よかった」「ありがたい」。' },
  'communication': { pos: '名詞', meaning: '【名】\n情報を伝え合うこと；連絡、通信。' },
  'hesitate': { pos: '動詞', meaning: '【動】\nためらう、すぐ行動せず迷う。' },
  'slight': { pos: '形容詞', meaning: '【形】\n程度・量などがごく小さい、わずかな。' },
  'liver': { pos: '名詞', meaning: '【名】\n肝臓；食材としてのレバー。' },
  'wise': { pos: '形容詞', meaning: '【形】\n知恵があり判断が適切な、賢明な。' },
  'tail': { pos: '名詞', meaning: '【名】\n動物の尾、しっぽ。' },
  'cruel': { pos: '形容詞', meaning: '【形】\n人や動物に苦痛を与えることを気にしない、残酷な。' },
  'neighbourhood': { pos: '名詞', meaning: '【名】\n近所、周辺地域。' },
  'humour': { pos: '名詞', meaning: '【名】\nユーモア、物事のおかしさを理解し楽しむ感覚。' },
  'grand piano': { pos: '名詞', meaning: '【名】\n弦を水平に張った大型のグランドピアノ。' },
  'prove': { pos: '動詞', meaning: '【動】\n証明する、事実であると示す。' },
  'clue': { pos: '名詞', meaning: '【名】\n問題や事件を解く手掛かり。' },
  'assemble': { pos: '動詞', meaning: '【動】\n人を一か所に集める、集合させる；集まる。' },
  'entertaining': { pos: '形容詞', meaning: '【形】\n面白い、楽しませる。' },
  'intend': { pos: '動詞', meaning: '【動】\n～するつもりである、意図する。' },
  'chapter': { pos: '名詞', meaning: '【名】\n本などの章；物事の一区切り。' },
  'performance': { pos: '名詞', meaning: '【名】\n① 演技、公演\n② 何かを実行すること、遂行。' },
  'simply': { pos: '副詞', meaning: '【副】\n① 単純に、ただ\n② 発言を強めて「本当に、まったく」。' },
  'cooperate': { pos: '動詞', meaning: '【動】\n共通の目的のため協力する。' },
  'signal': { pos: '名詞・動詞', meaning: '【名】\n行動開始などを知らせる合図、信号。\n【動】\n合図する、信号で知らせる。' },
  'former': { pos: '形容詞', meaning: '【形】\n以前の、前の、かつての。' },
  'fond': { pos: '形容詞', meaning: '【形】\n～が好きで、～を好んで。' },
  'examine': { pos: '動詞', meaning: '【動】\n詳しく調べる、検査する。' },
  'objection': { pos: '名詞', meaning: '【名】\n反対、異議。' },
  'advise': { pos: '動詞', meaning: '【動】\n助言する、～するよう勧める。' },
  'curtain': { pos: '名詞', meaning: '【名】\n窓や舞台などに掛けるカーテン、幕。' },
  'dumb': { pos: '形容詞', meaning: '【形】\n① 口語で、愚かな、頭の鈍い\n② 古い用法で、口がきけない。' },
  'kind': { pos: '形容詞', meaning: '【形】\n親切な、思いやりのある。' },
  'afterwards': { pos: '副詞', meaning: '【副】\nその後で、あとになって。' },
  'gradually': { pos: '副詞', meaning: '【副】\n徐々に、少しずつ。' },
  'scream': { pos: '動詞・名詞', meaning: '【動】\n恐怖・痛みなどで大声を上げる、叫ぶ。\n【名】\n叫び声、悲鳴。' },
  'fire': { pos: '動詞', meaning: '【動】\n① 火をつける\n② 銃などを発射する\n③ 解雇する。' },
  'chase': { pos: '動詞', meaning: '【動】\n人や動物を追いかける。' },
  'harm': { pos: '名詞・動詞', meaning: '【名】\n害、損害。\n【動】\n害を与える、傷つける。' },
  'mix': { pos: '動詞', meaning: '【動】\n① 混ぜる\n② 人や物をある状況・関係に巻き込む。' },
  'spare': { pos: '形容詞・動詞', meaning: '【形】\n予備の、余分の。\n【動】\n時間などを割く；人・物を免れさせる。' },
  'properly': { pos: '副詞', meaning: '【副】\n正しく、適切に、きちんと。' },
  'fade': { pos: '動詞・舞台用語', meaning: '【動】\n徐々に薄れる、弱まる。\n【舞台】\n光・音などを徐々に弱める。' }
};

for (const [lemma, patch] of Object.entries(unclassifiedFixes)) applyDictionaryFix(lemma, patch);

const genericContextStrings = new Set([
  '【ト書き】俳優の動き・表情・声・所作または場面状態を指定する語句。',
  '【舞台設定】Monkswell Manorの舞台装置・小道具・室内配置の記述で使われる。',
  '【ト書き】舞台上の位置を指定する語。'
]);

const curtainRiseSpeechIds = new Set([
  'act1-scene1-speech-0001',
  'act1-scene2-speech-0001'
]);

const railwayStationSpeechIds = new Set(['act1-scene1-speech-0081']);
const policeStationSpeechIds = new Set(['act2-speech-0324']);

let syncedMeanings = 0;
let removedGenericContexts = 0;
let concernedContexts = 0;
let anxiousContexts = 0;
let crossContexts = 0;
let resolvedPolysemyContexts = 0;

function setMissingContext(item, text) {
  if (String(item.inThisPlay || '').trim()) return false;
  item.inThisPlay = text;
  resolvedPolysemyContexts += 1;
  return true;
}

for (const [speechId, rows] of Object.entries(vocab)) {
  if (!Array.isArray(rows)) throw new Error(`vocabulary rows are not an array: ${speechId}`);
  const speechText = String(speechById.get(speechId)?.text || '');
  for (const item of rows) {
    const lemmaKey = key(item.lemma);
    const dictKey = dictKeyByLemma.get(lemmaKey);
    if (!dictKey) throw new Error(`missing dictionary entry: ${speechId} ${item.lemma}`);
    const dictionaryMeaning = String(dict[dictKey].meaning || '').trim();

    if (changedLemmas.has(lemmaKey) && String(item.meaning || '').trim() !== dictionaryMeaning) {
      item.meaning = dictionaryMeaning;
      syncedMeanings += 1;
    }

    if (genericContextStrings.has(String(item.inThisPlay || '').trim())) {
      delete item.inThisPlay;
      removedGenericContexts += 1;
    }

    if (lemmaKey === 'cross' && /^cross(?:es|ed|ing)?$/i.test(String(item.surface || '').trim())) {
      item.inThisPlay = '【ト書き】ここでは形容詞の「不機嫌な」ではなく、俳優が舞台上を横切って別の位置へ移動する、という動詞の舞台指示。';
      crossContexts += 1;
    }

    if (lemmaKey === 'concerned') {
      if (!/magistrate\s+concerned/i.test(speechText)) throw new Error(`unexpected concerned context: ${speechId}`);
      item.inThisPlay = 'ここでは「心配している」ではなく、the magistrate concerned で「その件に関係した／該当する判事」という後置修飾の意味。Longridge Farm事件で児童の委託に関与した判事を指す。';
      concernedContexts += 1;
    }

    if (lemmaKey === 'anxious') {
      if (/anxious\s+to\b/i.test(speechText)) {
        item.inThisPlay = 'ここでは「不安な」ではなく、anxious to ... の形で「ぜひ～したい／強く望む」の意味。';
      } else if (/anxious[^.?!]{0,80}\bthat\b/i.test(speechText)) {
        item.inThisPlay = 'ここでは「～ではないことを強く望んでいる／そうであってほしくないほど気にしている」という意味合い。';
      } else {
        throw new Error(`unclassified anxious context: ${speechId}`);
      }
      anxiousContexts += 1;
    }

    if (lemmaKey === 'rise') {
      if (curtainRiseSpeechIds.has(speechId)) {
        setMissingContext(item, '【ト書き】When Curtain rises の rises。ここでは人物が「立ち上がる」のではなく、幕が上がって場面が始まることを示す。');
      } else if (/^ris(?:e|es|ing)$/i.test(String(item.surface || '').trim())) {
        setMissingContext(item, '【ト書き】ここでは人物が座った状態などから立ち上がる動作を示す。');
      }
    }

    if (lemmaKey === 'station') {
      if (railwayStationSpeechIds.has(speechId)) {
        setMissingContext(item, 'ここでは「駅」。Mrs. Boyle と Major Metcalf がタクシーを相乗りした出発地点を指す。');
      } else if (policeStationSpeechIds.has(speechId)) {
        setMissingContext(item, 'ここでは「警察署」。Market Hampton の police station を指す。');
      }
    }

    if (lemmaKey === 'sex' && /^sex$/i.test(String(item.surface || '').trim())) {
      setMissingContext(item, 'ここでは sex maniac という当時の表現の中で「性的な」という意味で使われている。時代的な語法として読む。');
    }

    if (lemmaKey === 'peep' && speechId === 'act1-scene1-speech-0151') {
      setMissingContext(item, '【ト書き】Christopher が扉の中を短くのぞき込む動作を示す。');
    }

    if (lemmaKey === 'significantly' && speechId === 'act1-scene1-speech-0162') {
      setMissingContext(item, '【ト書き】単なる「重要に」ではなく、「意味ありげに、含みを持たせて」という演技指示。');
    }

    if (lemmaKey === 'gather') {
      setMissingContext(item, 'ここでは「集める」ではなく、I gather ... の形で「話や状況から～だと理解する／推測する」の意味。');
    }

    if (lemmaKey === 'affair') {
      if (speechId === 'act1-scene2-speech-0227') {
        setMissingContext(item, 'ここでは local affairs で「その土地の出来事・事情」。恋愛関係の意味ではない。');
      } else if (speechId === 'act2-speech-0165') {
        setMissingContext(item, 'ここでは settle their own affairs で「自分たち自身の事柄・身の回りのことを自分で決める」という意味。');
      } else if (speechId === 'act2-speech-0575') {
        setMissingContext(item, 'ここでは the Longridge Farm affair で「Longridge Farmの一件・事件」を指す。恋愛関係の意味ではない。');
      }
    }

    if (lemmaKey === 'gay' && speechId === 'act2-speech-0379') {
      setMissingContext(item, 'ここでは「陽気な、明るく楽しげな」という形容詞義で、a gay little tune を修飾している。');
    }

    if (lemmaKey === 'curtain' && speechId === 'act2-speech-0565') {
      setMissingContext(item, 'ここでは舞台全体の「幕」ではなく、部屋に掛かっているカーテン。懐中電灯がその後ろにある。');
    }

    if (lemmaKey === 'unconscious' && speechId === 'act2-speech-0612') {
      setMissingContext(item, 'ここでは鎮静剤によって「意識を失った／意識のない」状態になる、という意味。単に眠っているという意味ではない。');
    }
  }
}

for (const [lemma, entry] of Object.entries(dict)) {
  const meaning = String(entry.meaning || '').trim();
  if (!meaning) throw new Error(`empty dictionary meaning: ${lemma}`);
  if (meaning !== String(entry.coreMeaning || '').trim()) throw new Error(`dictionary core mismatch: ${lemma}`);
  if (/the magistrate concerned|Longridge Farm事件の児童委託/.test(meaning)) throw new Error(`play context leaked into dictionary: ${lemma}`);
}

write(DICT_PATH, dict);
write(VOCAB_PATH, vocab);

const dictSha = sha256(DICT_PATH);
const vocabSha = sha256(VOCAB_PATH);

const contract = read(CONTRACT_PATH);
for (const file of contract.files || []) {
  if (file.path === DICT_PATH) file.sha256 = dictSha;
  if (file.path === VOCAB_PATH) file.sha256 = vocabSha;
}
write(CONTRACT_PATH, contract);

const manifest = read(MANIFEST_PATH);
if (manifest.studyAssets?.wordDictionary) {
  manifest.studyAssets.wordDictionary.sha256 = dictSha;
  manifest.studyAssets.wordDictionary.entries = Object.keys(dict).length;
}
if (manifest.studyAssets?.lineVocabulary) {
  manifest.studyAssets.lineVocabulary.sha256 = vocabSha;
  manifest.studyAssets.lineVocabulary.items = Object.values(vocab).reduce((n, rows) => n + rows.length, 0);
  manifest.studyAssets.lineVocabulary.annotatedSpeeches = Object.values(vocab).filter(rows => rows.length).length;
}
write(MANIFEST_PATH, manifest);

const unclassifiedEntries = Object.entries(dict)
  .filter(([, entry]) => String(entry.pos || '').trim() === '未分類' || /【未分類】/.test(String(entry.meaning || '')))
  .map(([lemma, entry]) => ({ lemma, pos: String(entry.pos || ''), meaning: String(entry.meaning || '') }));
const remainingGenericContexts = Object.values(vocab).flat().filter(item => genericContextStrings.has(String(item.inThisPlay || '').trim())).length;
const polysemyMissingOccurrences = [];
for (const [speechId, rows] of Object.entries(vocab)) {
  for (const item of rows) {
    const dictKey = dictKeyByLemma.get(key(item.lemma));
    const entry = dictKey ? dict[dictKey] : null;
    if (Array.isArray(entry?.tags) && entry.tags.includes('polysemy') && !String(item.inThisPlay || '').trim()) {
      const speech = speechById.get(speechId);
      polysemyMissingOccurrences.push({
        speechId,
        speaker: String(speech?.speaker || ''),
        surface: String(item.surface || ''),
        lemma: String(item.lemma || ''),
        text: String(speech?.text || '')
      });
    }
  }
}

if (remainingGenericContexts !== 0) throw new Error(`generic inThisPlay remained: ${remainingGenericContexts}`);

const remainingCount = unclassifiedEntries.length + polysemyMissingOccurrences.length;
const report = {
  schemaVersion: 3,
  status: remainingCount === 0 ? 'PASS_SEMANTIC_CLOSURE' : 'PASS_WITH_REMAINING_AUDIT',
  changedLemmas: [...changedLemmas].sort(),
  syncedMeanings,
  removedGenericContexts,
  crossContexts,
  concernedContexts,
  anxiousContexts,
  resolvedPolysemyContexts,
  remaining: {
    unclassifiedDictionary: unclassifiedEntries.length,
    polysemyContextMissing: polysemyMissingOccurrences.length,
    unclassifiedEntries,
    polysemyMissingOccurrences
  },
  sha256: {
    dictionary: dictSha,
    vocabulary: vocabSha
  }
};
write(REPORT_PATH, report);
console.log(JSON.stringify(report, null, 2));
