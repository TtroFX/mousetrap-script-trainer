import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const parts = [1,2,3,4].map(n => `scripts/.tmp-vocab-range-0583-0873.payload.${n}`);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const payload = parts.map(p => fs.readFileSync(p, 'utf8').trim()).join('');
const expectedPayload = '1ba4045aec3aa7c77ceca4bb7e16923d5e062d7d784a7ba3526a3e219ab296b6';
if (sha(payload) !== expectedPayload) throw new Error(`payload SHA mismatch: ${sha(payload)}`);
const sourceBuffer = zlib.gunzipSync(Buffer.from(payload, 'base64'));
const expectedSource = 'fae8d924631e744af5ceeeca4772e7cfcf4e6afd7b8c6e92efa7a4c9f5e93a40';
if (sha(sourceBuffer) !== expectedSource) throw new Error(`source SHA mismatch: ${sha(sourceBuffer)}`);

const dictPath = 'mousetrap_word_dictionary.json';
const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
const preseed = {
  sex: { lemma:'sex', ipa:'/sɛks/', pos:'名詞', meaning:'【名詞】\n① 性、性別\n② 性行為、性的活動', forms:'sex · sexes', tags:['polysemy','context'] },
  relation: { lemma:'relation', ipa:'/rɪˈleɪʃən/', pos:'名詞', meaning:'【名詞】\n① 関係、関連\n② 親族、親類', forms:'relation · relations', tags:['polysemy','context'] },
  tackle: { lemma:'tackle', ipa:'/ˈtækəl/', pos:'名詞・動詞', meaning:'【名詞】\n① 特定の活動に使う用具一式、道具\n② 釣り道具\n【動詞】\n① 問題・仕事などに取り組む\n② 人を捕まえようとして組みつく、タックルする', forms:'tackle · tackles · tackled · tackling', tags:['polysemy','context'] },
  part: { lemma:'part', ipa:'/pɑːt/', pos:'名詞', meaning:'【名詞】\n① 部分、一部\n② 役割、役目\n③ 演劇・映画などの役、配役', forms:'part · parts', tags:['polysemy','theatre','context'] },
  field: { lemma:'field', ipa:'/fiːld/', pos:'名詞', meaning:'【名詞】\n① 野原、畑\n② 活動・研究などの分野\n③ 候補・参加者などの範囲・一団', forms:'field · fields', tags:['polysemy','context'] },
  check: { lemma:'check', ipa:'/tʃek/', pos:'動詞・名詞', meaning:'【動詞】\n① 正しいか・事実かを確認する、照合する\n② 進行・増加などを止める、抑える\n【名詞】\n① 確認、点検\n② 抑制、阻止', forms:'check · checks · checked · checking', tags:['polysemy','context'] }
};
for (const [key, value] of Object.entries(preseed)) if (!dict[key]) dict[key] = { ...value, coreMeaning:value.meaning };
fs.writeFileSync(dictPath, JSON.stringify(dict, null, 2) + '\n');

let source = sourceBuffer.toString('utf8');
const explicitStageRows = [
  ['MAJOR METCALF','MAJOR METCALF','rising; kindly','act2-speech-0097'],
  ['TROTTER','TROTTER','looking at GILES; stolidly','act2-speech-0099'],
  ['MOLLIE','Please','GILES exits after the others down Right, leaving the door open. MOLLIE shuts it. TROTTER moves to the arch up Right.','act2-speech-0108'],
  ['TROTTER','me MOLLIE Sergeant Trotter you think that this','She moves below the sofa.','act2-speech-0110'],
  ['MOLLIE','MOLLIE','shaken','act2-speech-0114'],
  ['TROTTER','TROTTER','right of the sofa; turning to her','act2-speech-0119'],
  ['TROTTER','TROTTER','considering','act2-speech-0133'],
  ['TROTTER','Major Metcalf','He moves to the armchair Centre and sits.','act2-speech-0133'],
  ['TROTTER','Mr Paravicini','He appears to consider.','act2-speech-0139'],
  ['TROTTER','TROTTER','significantly','act2-speech-0159'],
  ['MOLLIE','Yes but','She turns away.','act2-speech-0162'],
  ['MOLLIE','MOLLIE','turning back quickly','act2-speech-0164'],
  ['MOLLIE','MOLLIE','suspiciously','act2-speech-0176'],
  ['MOLLIE','Yes','TROTTER takes out a folded evening paper from the pocket.','act2-speech-0176'],
  ['CHRISTOPHER','Mollie','MOLLIE jumps up and hides the newspaper under the cushion in the armchair Centre.','act2-speech-0180'],
  ['MOLLIE','MOLLIE','facing CHRISTOPHER','act2-speech-0211'],
  ['MOLLIE','MOLLIE','showing the paper','act2-speech-0233'],
  ['GILES','GILES','moving up to the fire','act2-speech-0247'],
  ['GILES','GILES','moving up to Right of MOLLIE','act2-speech-0259'],
  ['MOLLIE','MOLLIE','looking guilty','act2-speech-0283'],
  ['GILES','GILES','following her','act2-speech-0300'],
  ['MOLLIE','MOLLIE','moving to Right of the sofa table','act2-speech-0316'],
  ['PARAVICINI','PARAVICINI','moving to the archway up Right and calling','act2-speech-0346'],
  ['PARAVICINI','Mr Ralston','GILES enters up Right and stands below the arch. PARAVICINI returns and sits in the small armchair down Right.','act2-speech-0346']
];
const stageMapCode = `const explicitStageMap = new Map(${JSON.stringify(explicitStageRows)}.map(([a,b,c,id]) => [[a,b,c].join('\\u0000'), id]));\n`;
const loopNeedle = 'for (const rec of stageRecords) {';
if (!source.includes(loopNeedle)) throw new Error('stage loop marker not found');
source = source.replace(loopNeedle, stageMapCode + loopNeedle);
const mapNeedle = 'const s = mapStageRecord(rec);';
if (!source.includes(mapNeedle)) throw new Error('stage map call marker not found');
source = source.replace(mapNeedle, `const explicitStageId = explicitStageMap.get([rec.speaker, rec.anchor, rec.direction].join('\\u0000'));\n  const s = explicitStageId ? {id: explicitStageId} : mapStageRecord(rec);`);

// Dump duplicate details, but force a diagnostic stop so this run cannot commit.
const dupMarker = 'target duplicate errors';
const dupPos = source.indexOf(dupMarker);
if (dupPos < 0) throw new Error('duplicate audit marker not found');
console.log('DUP_SOURCE_CONTEXT_START');
console.log(source.slice(Math.max(0,dupPos-1000), Math.min(source.length,dupPos+600)));
console.log('DUP_SOURCE_CONTEXT_END');
const dupRx = /if\s*\((\w+)\.length\)\s*fail\(`target duplicate errors \$\{\1\.length\}`\);/;
const dm = source.match(dupRx);
if (!dm) throw new Error('could not identify target duplicate fail statement');
const dupVar = dm[1];
source = source.replace(dupRx, `if (${dupVar}.length) console.log('TARGET_DUPLICATE_ERRORS=' + JSON.stringify(${dupVar}, null, 2));`);

const temp = 'scripts/.tmp-vocab-range-0583-0873.inner.mjs';
fs.writeFileSync(temp, source);
try {
  await import(pathToFileURL(`${process.cwd()}/${temp}`).href + `?run=${Date.now()}`);
  throw new Error('DIAGNOSTIC_STOP_AFTER_DUPLICATE_DUMP');
} finally {
  fs.rmSync(temp, { force:true });
}
