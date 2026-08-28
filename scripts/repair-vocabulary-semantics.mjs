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
  meaning: '【形容詞】\n不機嫌な、怒った。\n【動詞】\n① 横切る、渡る\n② 交差する。\n【名詞】\n十字形、十字架。',
  tags: Array.from(new Set([...(dict[dictKeyByLemma.get('cross')].tags || []), 'polysemy', 'stage-direction']))
});

applyDictionaryFix('concerned', {
  pos: '形容詞',
  forms: 'concerned（形容詞。concern の過去分詞形に由来）',
  meaning: '【形容詞】\n① 心配している、気にかけている\n② 関係している、関与している、該当する。',
  tags: Array.from(new Set([...(dict[dictKeyByLemma.get('concerned')].tags || []), 'polysemy', 'context']))
});

const genericContextStrings = new Set([
  '【ト書き】俳優の動き・表情・声・所作または場面状態を指定する語句。',
  '【舞台設定】Monkswell Manorの舞台装置・小道具・室内配置の記述で使われる。',
  '【ト書き】舞台上の位置を指定する語。'
]);

let syncedMeanings = 0;
let removedGenericContexts = 0;
let concernedContexts = 0;
let anxiousContexts = 0;
let crossContexts = 0;

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

const unclassifiedDictionary = Object.values(dict).filter(entry => String(entry.pos || '').trim() === '未分類' || /【未分類】/.test(String(entry.meaning || ''))).length;
const remainingGenericContexts = Object.values(vocab).flat().filter(item => genericContextStrings.has(String(item.inThisPlay || '').trim())).length;
const polysemyContextMissing = Object.values(vocab).flat().filter(item => {
  const dictKey = dictKeyByLemma.get(key(item.lemma));
  const entry = dictKey ? dict[dictKey] : null;
  return Array.isArray(entry?.tags) && entry.tags.includes('polysemy') && !String(item.inThisPlay || '').trim();
}).length;

if (remainingGenericContexts !== 0) throw new Error(`generic inThisPlay remained: ${remainingGenericContexts}`);

const report = {
  schemaVersion: 1,
  status: 'PASS_WITH_REMAINING_AUDIT',
  changedLemmas: [...changedLemmas].sort(),
  syncedMeanings,
  removedGenericContexts,
  crossContexts,
  concernedContexts,
  anxiousContexts,
  remaining: {
    unclassifiedDictionary,
    polysemyContextMissing
  },
  sha256: {
    dictionary: dictSha,
    vocabulary: vocabSha
  }
};
write(REPORT_PATH, report);
console.log(JSON.stringify(report, null, 2));
