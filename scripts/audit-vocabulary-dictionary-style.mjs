import fs from 'node:fs';

const DICT_PATH = 'mousetrap_word_dictionary.json';
const REPORT_PATH = 'data/vocabulary-dictionary-style-audit.json';
const dict = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8'));

const singleToken = lemma => !/\s/.test(String(lemma || '').trim());
const headers = meaning => [...String(meaning || '').matchAll(/【([^】]+)】/g)].map(m => m[1].trim());
const splitPos = pos => String(pos || '')
  .split(/[・/、,]/)
  .map(x => x.trim())
  .filter(Boolean);

const labelCounts = {};
const singleWordNoHeader = [];
const singleWordMultiPosCombinedHeader = [];
const singleWordMultiPosNoSeparateHeaders = [];
const allMultiPosSingleWords = [];

for (const [lemma, entry] of Object.entries(dict)) {
  const meaning = String(entry?.meaning || '');
  const pos = String(entry?.pos || '').trim();
  const hs = headers(meaning);
  for (const h of hs) labelCounts[h] = (labelCounts[h] || 0) + 1;

  if (!singleToken(lemma)) continue;

  if (hs.length === 0) {
    singleWordNoHeader.push({ lemma, pos, meaning });
  }

  const posParts = splitPos(pos);
  if (posParts.length > 1) {
    const row = { lemma, pos, headers: hs, meaning };
    allMultiPosSingleWords.push(row);
    if (hs.length === 1 && /[・/、,]/.test(hs[0])) singleWordMultiPosCombinedHeader.push(row);
    if (hs.length < 2) singleWordMultiPosNoSeparateHeaders.push(row);
  }
}

const report = {
  schemaVersion: 1,
  status: 'AUDIT_COMPLETE',
  policy: {
    target: 'single-token dictionary lemmas',
    expectation: 'Single words should read like dictionary entries. Multi-POS single words should normally separate meanings by part of speech rather than collapse them into one combined header.'
  },
  counts: {
    dictionaryEntries: Object.keys(dict).length,
    singleTokenEntries: Object.keys(dict).filter(singleToken).length,
    singleWordNoHeader: singleWordNoHeader.length,
    multiPosSingleWords: allMultiPosSingleWords.length,
    multiPosCombinedHeader: singleWordMultiPosCombinedHeader.length,
    multiPosWithoutSeparateHeaders: singleWordMultiPosNoSeparateHeaders.length
  },
  headerLabelCounts: Object.fromEntries(Object.entries(labelCounts).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]))),
  singleWordNoHeader,
  multiPosCombinedHeader: singleWordMultiPosCombinedHeader,
  multiPosWithoutSeparateHeaders: singleWordMultiPosNoSeparateHeaders
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.counts, null, 2));
