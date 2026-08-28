import fs from 'node:fs';

const fail = message => { throw new Error(message); };
const norm = value => String(value || '').trim();
const key = value => norm(value).toLowerCase();

const dict = JSON.parse(fs.readFileSync('mousetrap_word_dictionary.json', 'utf8'));
const vocab = JSON.parse(fs.readFileSync('mousetrap_line_vocabulary.json', 'utf8'));
const map = new Map(Object.entries(dict).map(([lemma, entry]) => [key(lemma), entry]));

const genericContexts = new Set([
  '【ト書き】俳優の動き・表情・声・所作または場面状態を指定する語句。',
  '【舞台設定】Monkswell Manorの舞台装置・小道具・室内配置の記述で使われる。',
  '【ト書き】舞台上の位置を指定する語。'
]);

let items = 0;
let ctx = 0;
let polysemyItems = 0;
const bySpeechLemma = new Map();

for (const [lemma, entry] of Object.entries(dict)) {
  const meaning = norm(entry.meaning);
  const coreMeaning = norm(entry.coreMeaning);
  const pos = norm(entry.pos);

  if (!meaning) fail(`missing meaning ${lemma}`);
  if (meaning !== coreMeaning) fail(`core mismatch ${lemma}`);
  if (!pos) fail(`missing pos ${lemma}`);
  if (pos === '未分類' || /【未分類】/.test(meaning)) fail(`unclassified dictionary entry ${lemma}`);
  if ('contextMeaning' in entry || 'contextExplanation' in entry) fail(`play context leaked into dictionary ${lemma}`);
  if (/the magistrate concerned|Longridge Farm事件の児童委託/.test(meaning)) fail(`play-specific prose leaked into dictionary ${lemma}`);
}

for (const [speechId, rows] of Object.entries(vocab)) {
  if (!Array.isArray(rows)) fail(`rows ${speechId}`);
  for (const item of rows) {
    items += 1;
    const lemmaKey = key(item.lemma);
    const entry = map.get(lemmaKey);
    if (!entry) fail(`missing lemma ${item.lemma}`);
    if (norm(item.meaning) !== norm(entry.meaning)) fail(`meaning mismatch ${speechId} ${item.lemma}`);

    const context = 'inThisPlay' in item ? norm(item.inThisPlay) : '';
    if ('inThisPlay' in item) {
      if (typeof item.inThisPlay !== 'string' || !context || context.length > 360 || context === norm(item.meaning)) {
        fail(`invalid inThisPlay ${speechId} ${item.lemma}`);
      }
      if (genericContexts.has(context)) fail(`generic inThisPlay ${speechId} ${item.lemma}`);
      ctx += 1;
    }

    if (Array.isArray(entry.tags) && entry.tags.includes('polysemy')) {
      polysemyItems += 1;
      if (!context) fail(`polysemy requires inThisPlay ${speechId} ${item.lemma}`);
    }

    const lookupKey = `${speechId}\u0000${lemmaKey}`;
    const list = bySpeechLemma.get(lookupKey) || [];
    list.push(item);
    bySpeechLemma.set(lookupKey, list);
  }
}

function requireDictionary(lemma, predicate, message) {
  const entry = map.get(key(lemma));
  if (!entry || !predicate(entry)) fail(message || `dictionary sentinel failed ${lemma}`);
}

function requireContext(speechId, lemma, predicate, message) {
  const rows = bySpeechLemma.get(`${speechId}\u0000${key(lemma)}`) || [];
  if (!rows.length) fail(`missing sentinel vocabulary ${speechId} ${lemma}`);
  if (!rows.some(item => predicate(norm(item.inThisPlay)))) fail(message || `context sentinel failed ${speechId} ${lemma}`);
}

requireDictionary('cross', entry => /【動】[\s\S]*横切/.test(norm(entry.meaning)), 'cross must retain the movement verb sense');
requireDictionary('concerned', entry => /関係している|関与している|該当する/.test(norm(entry.meaning)) && !/magistrate/i.test(norm(entry.meaning)), 'concerned dictionary/context separation regressed');

requireContext('act1-scene1-speech-0081', 'station', text => /駅/.test(text) && !/警察署/.test(text), 'railway station context regressed');
requireContext('act2-speech-0324', 'station', text => /警察署/.test(text), 'police station context regressed');
requireContext('act2-speech-0379', 'gay', text => /陽気|明るく楽しげ/.test(text), 'period sense of gay regressed');
requireContext('act2-speech-0565', 'curtain', text => /部屋|カーテン/.test(text), 'room-curtain context regressed');
requireContext('act2-speech-0612', 'unconscious', text => /意識/.test(text), 'unconscious context regressed');
requireContext('act1-scene1-speech-0001', 'rise', text => /幕が上が/.test(text), 'Act I Scene I curtain-rise context regressed');
requireContext('act1-scene2-speech-0001', 'rise', text => /幕が上が/.test(text), 'Act I Scene II curtain-rise context regressed');

console.log(JSON.stringify({
  status: 'PASS',
  dictionary: Object.keys(dict).length,
  vocabularyItems: items,
  inThisPlay: ctx,
  polysemyItems,
  unclassifiedDictionary: 0,
  genericInThisPlay: 0
}, null, 2));
