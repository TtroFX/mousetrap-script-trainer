import fs from 'node:fs';

const sceneCounts = {'act1-scene1':190,'act1-scene2':336,act2:638};
const files = Object.fromEntries(Object.keys(sceneCounts).map(scene => [scene, JSON.parse(fs.readFileSync(`data/interpretation/${scene}.json`,'utf8'))]));
const ledger = JSON.parse(fs.readFileSync('data/interpretation/truth-ledger.json','utf8'));
const fail = m => { throw new Error(m); };

let reviewed = 0;
let changed = 0;
for (const [scene, expectedCount] of Object.entries(sceneCounts)) {
  const data = files[scene];
  if (data?.qa?.truthAwareReview !== 'PASS') fail(`${scene}: truthAwareReview`);
  if (data?.qa?.fullPlayTruthChecked !== true) fail(`${scene}: fullPlayTruthChecked`);
  if (data?.policy?.fullPlayTruthAllowed !== true) fail(`${scene}: fullPlayTruthAllowed`);
  if (data.reviewedSpeechIds?.length !== expectedCount) fail(`${scene}: reviewed count`);
  reviewed += data.reviewedSpeechIds.length;
  changed += data.qa.truthAwareChangedSpeechCount;
}
if (reviewed !== 1164) fail(`reviewed total ${reviewed}/1164`);
if (ledger?.scope?.speechCount !== 1164) fail('ledger speechCount');
for (const [scene,count] of Object.entries(sceneCounts)) if (ledger?.scope?.scenes?.[scene] !== count) fail(`ledger scene count ${scene}`);
for (const key of ['trotter','metcalf','casewell','mollie','giles','christopher','mrsBoyle','paravicini']) if (!String(ledger?.facts?.[key] || '').trim()) fail(`ledger fact missing ${key}`);

const required = {
  'act1-scene1': {
    'act1-scene1-speech-0010':'concealment',
    'act1-scene1-speech-0011':'concealment',
    'act1-scene1-speech-0044':'lie',
  },
  'act1-scene2': {
    'act1-scene2-speech-0077':'lie',
    'act1-scene2-speech-0146':'lie',
    'act1-scene2-speech-0199':'feignedIgnorance',
    'act1-scene2-speech-0218':'concealment',
    'act1-scene2-speech-0231':'lie',
    'act1-scene2-speech-0314':'truth',
    'act1-scene2-speech-0335':'truth',
  },
  act2: {
    'act2-speech-0005':'feignedIgnorance',
    'act2-speech-0024':'lie',
    'act2-speech-0111':'lie',
    'act2-speech-0322':'truth',
    'act2-speech-0365':'concealment',
    'act2-speech-0372':'truth',
    'act2-speech-0481':'lie',
    'act2-speech-0519':'misdirection',
    'act2-speech-0531':'truth',
    'act2-speech-0569':'feignedIgnorance',
    'act2-speech-0583':'mistakenBelief',
    'act2-speech-0614':'truth',
    'act2-speech-0618':'truth',
  }
};
for (const [scene, checks] of Object.entries(required)) {
  for (const [id, kind] of Object.entries(checks)) {
    const notes = files[scene].interpretations?.[id];
    if (!Array.isArray(notes) || !notes.some(note => note.kind === kind)) fail(`${scene}/${id}: missing ${kind}`);
  }
}

for (const [scene, ids] of Object.entries(ledger.changedSpeechIds || {})) {
  if (!Array.isArray(ids)) fail(`ledger changed ids ${scene}`);
  if (new Set(ids).size !== ids.length) fail(`ledger duplicate changed ids ${scene}`);
  const expected = new Set(files[scene].reviewedSpeechIds);
  for (const id of ids) if (!expected.has(id)) fail(`ledger unknown id ${scene}/${id}`);
  if (ids.length !== files[scene].qa.truthAwareChangedSpeechCount) fail(`ledger changed count ${scene}`);
}

console.log(JSON.stringify({status:'PASS',reviewed,truthAwareChangedSpeeches:changed,scenes:sceneCounts},null,2));
