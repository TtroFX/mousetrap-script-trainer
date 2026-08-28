import fs from 'node:fs';
import crypto from 'node:crypto';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const write = (path, value) => fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const sha256 = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const key = value => String(value || '').trim().toLowerCase();

const DICT_PATH = 'mousetrap_word_dictionary.json';
const VOCAB_PATH = 'mousetrap_line_vocabulary.json';
const CONTRACT_PATH = 'data/canonical-production-contract.json';
const MANIFEST_PATH = 'data/canonical-integration-manifest.json';
const REPORT_PATH = 'data/vocabulary-dictionary-style-repair-report.json';

const dict = read(DICT_PATH);
const vocab = read(VOCAB_PATH);
const dictKeyByLemma = new Map(Object.keys(dict).map(k => [key(k), k]));

const fixes = {
  'Centre': { meaning: '【舞台】\n舞台中央。' },
  'frowning': { pos: '動詞（現在分詞）', meaning: '【動】\nfrown の現在分詞。眉をひそめる。' },
  'shrugging': { pos: '動詞（現在分詞）', meaning: '【動】\nshrug の現在分詞。肩をすくめる。' },
  'reeling': { pos: '動詞（現在分詞）', meaning: '【動】\nreel の現在分詞。よろめく、ふらつく。' },
  'wailing': { pos: '動詞（現在分詞）', meaning: '【動】\nwail の現在分詞。大声で嘆く、泣き叫ぶ。' },
  'antiquarian': { meaning: '【形】\n古物・古書・歴史資料などに関する、好古趣味の。\n【名】\n古物・古書・歴史資料などを研究・収集する人、好古家。' },
  'ditto': { meaning: '【副】\n前と同じく、同様に。\n【名】\n前と同じ内容であることを示す「同上」。' },
  'waste': { meaning: '【動】\n時間・物資などを無駄にする。\n【名】\n無駄、浪費。' },
  'attempt': { meaning: '【動】\n難しいことをやってみる、試みる。\n【名】\n試み、企て。' },
  'fake': { meaning: '【名】\n偽物。\n【形】\n偽の、偽物の。\n【動】\n偽造する、装う。' },
  'solid': { meaning: '【形】\n固体の、頑丈な、中身の詰まった。\n【名】\n固体。' },
  'prefab': { meaning: '【名】\nあらかじめ工場で部材を作り、現場で組み立てるプレハブ建築。\n【形】\nプレハブ式の、あらかじめ部材を製造した。' },
  'indeed': { meaning: '【副】\n実に、本当に、確かに。\n【間投的表現】\n返答で確認・強調を表す。' },
  'European': { meaning: '【形】\nヨーロッパの。\n【名】\nヨーロッパ人。' },
  'local': { meaning: '【形】\nその地域の、地元の。\n【名】\n地元の人。' },
  'fit': { meaning: '【動】\n大きさ・条件・特徴などが合う、適合する。\n【形】\n適した、ふさわしい。' },
  'hint': { meaning: '【動】\n直接言わずにほのめかす。\n【名】\nほのめかし、手掛かり。' },
  'original': { meaning: '【形】\n独創的な、最初の、原物の。\n【名】\n原物、原本。' },
  'till': { meaning: '【前】\n～まで。\n【接】\n～する時まで。' },
  'plenty': { meaning: '【代】\n十分以上の量、多くのもの・こと。\n【名】\n十分な量、豊富さ。' },
  'whisper': { meaning: '【名】\nささやき、小声。\n【動】\n非常に小さな声で話す、ささやく。' },
  'consent': { meaning: '【名】\n同意、承諾。\n【動】\n同意する、承諾する。' },
  'firsthand': { meaning: '【形】\n他人からの伝聞ではなく、直接の経験・観察による。\n【副】\n直接に、自分自身で。' },
  'snick': { meaning: '【間投】\n小さく鋭い切断音・クリック音を表す。\n【名】\n小さく鋭い切断音・クリック音。' },
  'jap': { meaning: '【名】\nJapanese を指す短縮形。現在は侮蔑的・攻撃的な語。\n【形】\nJapanese を表す短縮形。現在は侮蔑的・攻撃的な語。' },
  'downstage': { meaning: '【副】\n舞台前方（客席寄り）へ、舞台前方で。\n【形】\n舞台前方の。\n【名】\n舞台前方。' }
};

const changed = [];
for (const [lemma, patch] of Object.entries(fixes)) {
  const dictKey = dictKeyByLemma.get(key(lemma));
  if (!dictKey) throw new Error(`dictionary entry missing: ${lemma}`);
  const entry = dict[dictKey];
  if (patch.pos) entry.pos = patch.pos;
  entry.meaning = patch.meaning;
  entry.coreMeaning = patch.meaning;
  changed.push(dictKey);
}

let syncedVocabularyItems = 0;
for (const rows of Object.values(vocab)) {
  if (!Array.isArray(rows)) continue;
  for (const item of rows) {
    const dictKey = dictKeyByLemma.get(key(item.lemma));
    if (!dictKey || !fixes[dictKey]) continue;
    const meaning = dict[dictKey].meaning;
    if (String(item.meaning || '').trim() !== String(meaning).trim()) {
      item.meaning = meaning;
      syncedVocabularyItems += 1;
    }
  }
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
  changedDictionaryEntries: changed.length,
  changedLemmas: changed.sort((a,b) => a.localeCompare(b)),
  syncedVocabularyItems,
  sha256: { dictionary: dictSha, vocabulary: vocabSha }
};
write(REPORT_PATH, report);
console.log(JSON.stringify(report, null, 2));
