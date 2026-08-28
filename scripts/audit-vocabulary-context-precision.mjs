import fs from 'node:fs';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const write = (path, value) => fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const norm = value => String(value || '').normalize('NFKC').trim();
const key = value => norm(value).toLowerCase();

const dict = read('mousetrap_word_dictionary.json');
const vocab = read('mousetrap_line_vocabulary.json');
const script = read('mousetrap_script_data.json');
const speechById = new Map();
for (const scene of Object.values(script)) {
  for (const speech of scene?.speeches || []) speechById.set(speech.id, speech);
}

const dictByKey = new Map(Object.entries(dict).map(([lemma, entry]) => [key(lemma), { dictionaryKey: lemma, entry }]));
const genericProperMeaning = /^(?:【固有名詞】\s*)?(?:人名[。.]?|地名[。.]?|通りの名称(?:として用いられる)?固有名詞[。.]?|固有名詞[。.]?)$/s;
const playSpecificDictionaryTokens = [
  '劇中', 'Monkswell', 'Longridge Farm', 'Mrs. Boyle', 'Mollie', 'Giles', 'Christopher Wren',
  'Miss Casewell', 'Paravicini', 'Trotter', 'Major Metcalf', 'Maureen Lyon', 'Culver Street殺人',
  '三匹の盲目のねずみ', 'Three Blind Mice'
];

const properNounMissingContext = [];
const genericProperNounMissingContext = [];
const dictionaryPlayContextCandidates = [];
const repeatedContexts = new Map();
let contextItems = 0;
let properNounOccurrences = 0;

for (const [lemma, entry] of Object.entries(dict)) {
  const meaning = norm(entry?.meaning);
  const hits = playSpecificDictionaryTokens.filter(token => meaning.includes(token));
  if (hits.length) dictionaryPlayContextCandidates.push({ lemma, pos: norm(entry?.pos), meaning, hits });
}

for (const [speechId, rows] of Object.entries(vocab)) {
  for (const item of Array.isArray(rows) ? rows : []) {
    const found = dictByKey.get(key(item.lemma));
    if (!found) continue;
    const { dictionaryKey, entry } = found;
    const context = norm(item.inThisPlay);
    const pos = norm(entry?.pos);
    const meaning = norm(entry?.meaning);
    const speech = speechById.get(speechId);

    if (context) {
      contextItems += 1;
      const arr = repeatedContexts.get(context) || [];
      arr.push({ speechId, lemma: item.lemma, surface: item.surface });
      repeatedContexts.set(context, arr);
    }

    if (/固有名詞/.test(pos)) {
      properNounOccurrences += 1;
      if (!context) {
        const row = {
          speechId,
          speaker: norm(speech?.speaker),
          surface: norm(item.surface),
          lemma: dictionaryKey,
          pos,
          meaning,
          text: norm(speech?.text)
        };
        properNounMissingContext.push(row);
        if (genericProperMeaning.test(meaning.replace(/\n+/g, ' '))) genericProperNounMissingContext.push(row);
      }
    }
  }
}

const repeatedContextGroups = [...repeatedContexts.entries()]
  .filter(([, occurrences]) => occurrences.length >= 3)
  .map(([context, occurrences]) => ({ context, count: occurrences.length, occurrences }))
  .sort((a, b) => b.count - a.count || a.context.localeCompare(b.context));

const report = {
  schemaVersion: 1,
  status: 'AUDIT_COMPLETE',
  policy: {
    inThisPlayOptional: true,
    addOnlyWhenContextMateriallyChangesOrClarifiesMeaning: true,
    properNounsNotAutomaticallyContextRequired: true,
    dictionaryMustRemainNeutral: true
  },
  counts: {
    dictionaryEntries: Object.keys(dict).length,
    vocabularyItems: Object.values(vocab).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0),
    contextItems,
    properNounOccurrences,
    properNounMissingContext: properNounMissingContext.length,
    genericProperNounMissingContext: genericProperNounMissingContext.length,
    dictionaryPlayContextCandidates: dictionaryPlayContextCandidates.length,
    repeatedContextGroups: repeatedContextGroups.length
  },
  compact: {
    genericProperNounMissingContext: genericProperNounMissingContext.map(x => `${x.speechId}|${x.lemma}|${x.surface}`),
    dictionaryPlayContextCandidates: dictionaryPlayContextCandidates.map(x => x.lemma),
    repeatedContexts: repeatedContextGroups.map(x => ({ count: x.count, context: x.context }))
  },
  genericProperNounMissingContext,
  dictionaryPlayContextCandidates,
  repeatedContextGroups
};

write('data/vocabulary-context-precision-audit.json', report);
console.log(JSON.stringify({ counts: report.counts, compact: report.compact }, null, 2));
