import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const parts = [1,2,3,4].map(n => `scripts/.tmp-vocab-range-0583-0873.payload.${n}`);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const payload = parts.map(p => fs.readFileSync(p, 'utf8').trim()).join('');
const expectedPayload = '1ba4045aec3aa7c77ceca4bb7e16923d5e062d7d784a7ba3526a3e219ab296b6';
if (sha(payload) !== expectedPayload) throw new Error(`payload SHA mismatch: ${sha(payload)}`);
const source = zlib.gunzipSync(Buffer.from(payload, 'base64'));
const expectedSource = 'fae8d924631e744af5ceeeca4772e7cfcf4e6afd7b8c6e92efa7a4c9f5e93a40';
if (sha(source) !== expectedSource) throw new Error(`source SHA mismatch: ${sha(source)}`);

// Preseed dictionary lemmas that the augmentation intentionally attaches
// context-specific inThisPlay notes to. Keep meaning dictionary-like; play
// interpretation remains on line-vocabulary rows.
const dictPath = 'mousetrap_word_dictionary.json';
const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
const preseed = {
  sex: {
    lemma: 'sex', ipa: '/sɛks/', pos: '名詞',
    meaning: '【名詞】\n① 性、性別\n② 性行為、性的活動',
    forms: 'sex · sexes', tags: ['polysemy', 'context']
  },
  relation: {
    lemma: 'relation', ipa: '/rɪˈleɪʃən/', pos: '名詞',
    meaning: '【名詞】\n① 関係、関連\n② 親族、親類',
    forms: 'relation · relations', tags: ['polysemy', 'context']
  },
  tackle: {
    lemma: 'tackle', ipa: '/ˈtækəl/', pos: '名詞・動詞',
    meaning: '【名詞】\n① 特定の活動に使う用具一式、道具\n② 釣り道具\n【動詞】\n① 問題・仕事などに取り組む\n② 人を捕まえようとして組みつく、タックルする',
    forms: 'tackle · tackles · tackled · tackling', tags: ['polysemy', 'context']
  },
  part: {
    lemma: 'part', ipa: '/pɑːt/', pos: '名詞',
    meaning: '【名詞】\n① 部分、一部\n② 役割、役目\n③ 演劇・映画などの役、配役',
    forms: 'part · parts', tags: ['polysemy', 'theatre', 'context']
  },
  field: {
    lemma: 'field', ipa: '/fiːld/', pos: '名詞',
    meaning: '【名詞】\n① 野原、畑\n② 活動・研究などの分野\n③ 候補・参加者などの範囲・一団',
    forms: 'field · fields', tags: ['polysemy', 'context']
  },
  check: {
    lemma: 'check', ipa: '/tʃek/', pos: '動詞・名詞',
    meaning: '【動詞】\n① 正しいか・事実かを確認する、照合する\n② 進行・増加などを止める、抑える\n【名詞】\n① 確認、点検\n② 抑制、阻止',
    forms: 'check · checks · checked · checking', tags: ['polysemy', 'context']
  }
};
for (const [key, value] of Object.entries(preseed)) {
  if (!dict[key]) dict[key] = { ...value, coreMeaning: value.meaning };
}
fs.writeFileSync(dictPath, JSON.stringify(dict, null, 2) + '\n');

const temp = 'scripts/.tmp-vocab-range-0583-0873.inner.mjs';
fs.writeFileSync(temp, source);
try {
  await import(pathToFileURL(`${process.cwd()}/${temp}`).href + `?run=${Date.now()}`);
} finally {
  fs.rmSync(temp, { force: true });
}
