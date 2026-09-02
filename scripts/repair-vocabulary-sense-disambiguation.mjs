import crypto from 'node:crypto';
import fs from 'node:fs';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const write = (path, value) => fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const sha256 = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');

const dictionaryPath = 'mousetrap_word_dictionary.json';
const vocabularyPath = 'mousetrap_line_vocabulary.json';
const dictionary = read(dictionaryPath);
const vocabulary = read(vocabularyPath);

const neutralMeanings = {
  'a lot may happen': '多くのことが起こるかもしれない、状況が大きく変わる可能性がある。',
  adore: '【動詞】\n① 崇拝する\n② 大好きである、非常に好む。',
  'bedrock respectability': '揺るぎない、根本的な社会的信用・体面。',
  dogsbody: '【名詞】\n雑用を何でもさせられる人、下働き。',
  dramatic: '【形容詞】\n① 劇・演劇の\n② 劇的な、印象的な、芝居がかった。',
  faded: '【形容詞】\n色・新鮮さ・活力などが薄れた、色あせた。',
  'feminine spirit': '伝統的に女性らしいと見なされてきた気質・魅力・自信。',
  'frame someone for': '人にぬれぎぬを着せ、していない犯罪の犯人に仕立てる。',
  'full particulars': '必要な事項を漏れなく含む詳しい情報、詳細。',
  'get somewhere': '進展する、成果を上げる、目的に近づく。',
  'get to business': '本題・仕事に取りかかる。',
  'go into something': '① ～の中へ入る\n② ～を詳しく論じる・調べる。',
  'indeterminate build': 'はっきり分類・特定できない体格。',
  'keep one step ahead': '相手・状況より一歩先を行き、先回りする。',
  madly: '【副詞】\n① 狂ったように\n② 口語で、非常に・ものすごく。',
  'on file': '記録として保管・登録されていて、参照できる状態で。',
  plummy: '【形容詞】\n① プラムのような濃い赤紫色の\n② 声が豊かで気取った響きの。',
  'place reliance on': '～を信頼する、～を頼りにする。',
  'queer in the head': '精神状態が正常でないと決めつける、古く侮蔑的な口語表現。',
  save: '【動詞】\n① 危険・死などから救う\n② 保存する、取っておく\n③ 節約する。',
  'slip up': '不注意から間違いをする、しくじる。',
  'spoil the effect': '意図した印象・効果を損なう、台無しにする。',
  'the last thing in': '（古風）～における最新の流行・型・技術。',
  'to no avail': '何の効果・成果もなく、むだに。',
  "trace someone's whereabouts": '人の現在の居場所を追跡して突き止める。',
  'what someone is like': '人の性格・特徴・様子がどのようなものか。',
  woodworm: '【名詞】\n木材を食害する甲虫の幼虫、またはその虫害。'
};

for (const [lemma, neutral] of Object.entries(neutralMeanings)) {
  const entry = dictionary[lemma];
  if (!entry) throw new Error(`Missing contextual dictionary entry: ${lemma}`);
  const oldMeaning = entry.meaning;
  for (const rows of Object.values(vocabulary)) {
    for (const item of rows) {
      if (item.lemma !== lemma) continue;
      if (!item.inThisPlay) item.inThisPlay = oldMeaning;
      item.playMeaning = true;
      item.meaning = neutral;
    }
  }
  entry.meaning = neutral;
  entry.coreMeaning = neutral;
}

dictionary.feel = {
  lemma: 'feel',
  ipa: '/fiːl/',
  pos: '動詞・名詞',
  coreMeaning: '【動詞】\n① 感じる、感覚・感情を覚える\n② 触って確かめる。\n【名詞】\n感触、感じ。',
  forms: 'feel - felt - felt',
  tags: ['polysemy'],
  meaning: '【動詞】\n① 感じる、感覚・感情を覚える\n② 触って確かめる。\n【名詞】\n感触、感じ。'
};

dictionary.Waring = {
  lemma: 'Waring',
  ipa: '',
  pos: '固有名詞',
  coreMeaning: '【固有名詞】\n英語圏の姓 Waring。',
  forms: '固有名詞のため語形変化なし',
  tags: ['proper-noun'],
  meaning: '【固有名詞】\n英語圏の姓 Waring。'
};

const replace = (speechId, surface, patch) => {
  const item = vocabulary[speechId]?.find(row => row.surface === surface);
  if (!item) throw new Error(`Missing vocabulary item: ${speechId}/${surface}`);
  Object.assign(item, patch);
};

const replaceOnce = (speechId, oldSurface, finalSurface, finalLemma, patch) => {
  const rows = vocabulary[speechId] || [];
  const oldItem = rows.find(row => row.surface === oldSurface);
  if (oldItem) return Object.assign(oldItem, patch);
  const finalItem = rows.find(row => row.surface === finalSurface && row.lemma === finalLemma);
  if (!finalItem) throw new Error(`Missing vocabulary item: ${speechId}/${oldSurface}`);
  Object.assign(finalItem, patch);
};

replaceOnce('act2-speech-0307', 'felt', 'felt', 'feel', {
  lemma: 'feel',
  meaning: dictionary.feel.meaning,
  playMeaning: true,
  inThisPlay: 'thought or felt or suffered の felt。feel の過去分詞で、Mollieと知り合う前にどんな感情を抱いたか、という意味。'
});

for (const speechId of ['act2-speech-0577', 'act2-speech-0579']) {
  replaceOnce(speechId, 'Waring', 'Waring', 'Waring', {
    lemma: 'Waring',
    meaning: dictionary.Waring.meaning,
    playMeaning: true,
    inThisPlay: 'Mollieが結婚前に名乗っていた姓。一般名詞 war（戦争）とは無関係。'
  });
}

replaceOnce('act1-scene1-speech-0108', 'deed', 'In-deed', 'indeed', {
  surface: 'In-deed',
  lemma: 'indeed',
  meaning: dictionary.indeed.meaning,
  playMeaning: true,
  inThisPlay: 'Mrs. Boyleが indeed を区切って強く発音し、驚きと不満を込めて「まあ、そうですか」のように応じている。deed（行為・証書）ではない。'
});

const badStageSurface = 'puts down a suitcase he is carrying and moves above the armchair Centre; MOLLIE moves up';
vocabulary['act1-scene1-speech-0098'] = vocabulary['act1-scene1-speech-0098'].filter(
  item => !(item.surface === badStageSurface && item.lemma === 'hold up')
);

const sortedDictionary = Object.fromEntries(
  Object.entries(dictionary).sort(([a], [b]) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
);
write(dictionaryPath, sortedDictionary);
write(vocabularyPath, vocabulary);

const contract = read('data/canonical-production-contract.json');
for (const file of contract.files) {
  if (file.path === dictionaryPath || file.path === vocabularyPath) file.sha256 = sha256(file.path);
}
write('data/canonical-production-contract.json', contract);

const manifestPath = 'data/canonical-integration-manifest.json';
const manifest = read(manifestPath);
if (manifest.studyAssets?.lineVocabulary) manifest.studyAssets.lineVocabulary.sha256 = sha256(vocabularyPath);
if (manifest.studyAssets?.wordDictionary) {
  manifest.studyAssets.wordDictionary.sha256 = sha256(dictionaryPath);
  manifest.studyAssets.wordDictionary.entries = Object.keys(sortedDictionary).length;
  manifest.studyAssets.wordDictionary.referencedLemmas = new Set(
    Object.values(vocabulary).flat().map(item => item.lemma.toLowerCase())
  ).size;
}
write(manifestPath, manifest);

console.log(JSON.stringify({
  status: 'PASS',
  neutralizedDictionaryMeanings: Object.keys(neutralMeanings).length,
  correctedSenseMappings: 4,
  removedFalseStagePhraseMappings: 1,
  dictionaryEntries: Object.keys(sortedDictionary).length
}, null, 2));
