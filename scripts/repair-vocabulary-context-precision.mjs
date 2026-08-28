import fs from 'node:fs';
import crypto from 'node:crypto';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const write = (path, value) => fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const sha256 = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const key = value => String(value || '').normalize('NFKC').trim().toLowerCase();

const DICT_PATH = 'mousetrap_word_dictionary.json';
const VOCAB_PATH = 'mousetrap_line_vocabulary.json';
const SCRIPT_PATH = 'mousetrap_script_data.json';
const CONTRACT_PATH = 'data/canonical-production-contract.json';
const MANIFEST_PATH = 'data/canonical-integration-manifest.json';
const REPORT_PATH = 'data/vocabulary-context-precision-repair-report.json';

const dict = read(DICT_PATH);
const vocab = read(VOCAB_PATH);
const script = read(SCRIPT_PATH);
const speechById = new Map();
for (const scene of Object.values(script)) for (const speech of scene?.speeches || []) speechById.set(speech.id, speech);
const dictKeyByLemma = new Map(Object.keys(dict).map(k => [key(k), k]));

const dictionaryFixes = {
  'cut off': '【句動詞】\n① 切り離す、切り取る\n② 外部との連絡・交通などを断つ、孤立させる。',
  'wider field': '【名詞句】\nより広い範囲、より多くの対象・選択肢がある範囲。',
  "run in someone's head": '【慣用表現】\n考え・旋律などが頭の中で繰り返し浮かぶ、頭から離れない。',
  'reproach oneself': '【動詞句】\n自分自身を責める、自責する。',
  "Morgan's Bank": "【固有名詞】\nMorgan's Bankという銀行名。",
  'Ledbury Hotel': '【固有名詞】\nLedbury Hotelというホテル名。',
  'Spot and Plain': '【固有名詞】\nSpot と Plain という二つの名前。',
  'Monkswell Manor Guest House': '【固有名詞】\nMonkswell Manor Guest Houseという宿泊施設名。'
};

const contextRemovalStrings = new Set([
  'ト書きでは指定された舞台位置へ俳優が移動すること。',
  '【ト書き】俳優の舞台上での位置移動を指定する語。',
  '【ト書き】俳優・人物が舞台へ登場する指示。',
  '【ト書き】俳優・人物が舞台から退場する指示。',
  '【ト書き】俳優から見て舞台奥右を示す位置指定。',
  '【ト書き】舞台中央という位置指定。',
  'ト書きの Centre は舞台中央の位置指定。',
  '【ト書き】人物が舞台上に見えない場所から声を出す、または舞台外にいることを示す。',
  '【舞台設定】照明・音響・効果音のタイミングや状態を示す指示。',
  '【ト書き】俳優から見て舞台奥左を示す位置指定。',
  '【ト書き】俳優から見て舞台前方右を示す位置指定。',
  'ト書きでは人物が舞台上の場面から退場すること。',
  'ト書きでは人物が舞台上の場面へ登場すること。',
  '四本の柱で天蓋を支えるfour-poster bedを指す。',
  '【ト書き】俳優から見て舞台前方左を示す位置指定。',
  '【ト書き】舞台奥中央を示す位置指定。',
  '演技上の間を置く指示。無言の時間そのものが反応や緊張を表す。',
  '相手や客席から顔・体をそむける動作。',
  '【ト書き】客席に近い舞台前方を示す位置指定。'
]);

const changedDictionary = [];
for (const [lemma, meaning] of Object.entries(dictionaryFixes)) {
  const dictKey = dictKeyByLemma.get(key(lemma));
  if (!dictKey) throw new Error(`dictionary entry missing: ${lemma}`);
  dict[dictKey].meaning = meaning;
  dict[dictKey].coreMeaning = meaning;
  changedDictionary.push(dictKey);
}

let syncedMeanings = 0;
let removedRedundantContexts = 0;
let addedContexts = 0;

const contextOverrides = new Map([
  ['act1-scene1-speech-0190\u0000cut off\u0000cut off from civilization', '大雪で交通や配達が途絶え、Monkswell Manorが外界から孤立すること。'],
  ['act1-scene1-speech-0190\u0000cut off\u0000cut off', '大雪で交通や配達が途絶え、Monkswell Manorが外界から孤立すること。'],
  ['act1-scene2-speech-0167\u0000cut off\u0000cut off', 'ここでは雪に加えて電話も不通になり、Monkswell Manorが外部との移動・通信を断たれた状態。'],
  ['act2-speech-0379\u0000cut off\u0000cut off', 'ここでは「孤立する」ではなく、童謡の cut off their tails で「尾を切り落とす」の意味。'],
  ['act2-speech-0020\u0000wider field\u0000a wider field', 'Culver Streetでは被害者候補が一人だったのに対し、Monkswell Manorには次の標的になり得る人物が複数いる、という意味。'],
  ["act2-speech-0054\u0000run in someone's head\u0000runs in people's head", 'ここではThree Blind Miceの旋律が頭から離れず、繰り返し浮かぶという意味。'],
  ["act2-speech-0596\u0000spot and plain\u0000spot and plain", '直前にCasewellが思い出したLongridge Farmの犬たち、SpotとPlainを指す。'],
  ['act1-scene2-speech-0206\u0000three blind mice\u0000three blind mice', 'ここでは殺人事件のメモや紙に記された言葉・旋律として現れ、事件を結びつける反復モチーフになっている童謡。']
]);

for (const [speechId, rows] of Object.entries(vocab)) {
  if (!Array.isArray(rows)) continue;
  for (const item of rows) {
    const dictKey = dictKeyByLemma.get(key(item.lemma));
    if (dictKey && Object.prototype.hasOwnProperty.call(dictionaryFixes, dictKey)) {
      const neutral = dict[dictKey].meaning;
      if (String(item.meaning || '').trim() !== neutral) {
        item.meaning = neutral;
        syncedMeanings += 1;
      }
    }

    const existingContext = String(item.inThisPlay || '').trim();
    if (contextRemovalStrings.has(existingContext)) {
      delete item.inThisPlay;
      removedRedundantContexts += 1;
    }

    const overrideKey = `${speechId}\u0000${key(item.lemma)}\u0000${key(item.surface)}`;
    const override = contextOverrides.get(overrideKey);
    if (override && String(item.inThisPlay || '').trim() !== override) {
      item.inThisPlay = override;
      addedContexts += 1;
    }
  }
}

for (const overrideKey of contextOverrides.keys()) {
  const [speechId, lemmaKey, surfaceKey] = overrideKey.split('\u0000');
  const matches = (vocab[speechId] || []).filter(item => key(item.lemma) === lemmaKey && key(item.surface) === surfaceKey);
  if (matches.length !== 1) throw new Error(`context override target mismatch ${overrideKey}: ${matches.length}`);
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
  manifest.studyAssets.lineVocabulary.items = Object.values(vocab).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0);
  manifest.studyAssets.lineVocabulary.annotatedSpeeches = Object.values(vocab).filter(rows => Array.isArray(rows) && rows.length).length;
}
write(MANIFEST_PATH, manifest);

const report = {
  schemaVersion: 1,
  status: 'APPLIED',
  changedDictionaryEntries: changedDictionary.length,
  changedDictionary: changedDictionary.sort((a,b) => a.localeCompare(b)),
  syncedMeanings,
  removedRedundantContexts,
  addedOrUpdatedContexts: addedContexts,
  finalContextItems: Object.values(vocab).flat().filter(item => String(item.inThisPlay || '').trim()).length,
  sha256: { dictionary: dictSha, vocabulary: vocabSha }
};
write(REPORT_PATH, report);
console.log(JSON.stringify(report, null, 2));
