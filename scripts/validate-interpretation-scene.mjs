import fs from 'node:fs';

const sceneId = process.argv[2];
if (!sceneId) throw new Error('usage: node scripts/validate-interpretation-scene.mjs <sceneId>');
const script = JSON.parse(fs.readFileSync('mousetrap_script_data.json','utf8'));
const file = `data/interpretation/${sceneId}.json`;
const data = JSON.parse(fs.readFileSync(file,'utf8'));
const speeches = script?.[sceneId]?.speeches;
if (!Array.isArray(speeches) || !speeches.length) throw new Error(`unknown scene ${sceneId}`);
const expectedIds = speeches.map(x => x.id);
const expectedSet = new Set(expectedIds);
const fail = m => { throw new Error(m); };
if (data.schemaVersion !== 1) fail('schemaVersion');
if (data.sceneId !== sceneId) fail('sceneId mismatch');
if (data.scope?.speechCount !== expectedIds.length) fail('scope speechCount');
if (data.scope?.firstSpeechId !== expectedIds[0] || data.scope?.lastSpeechId !== expectedIds.at(-1)) fail('scope boundary');
if (data.policy?.allSpeechesReviewed !== true || data.policy?.interpretationOptional !== true) fail('policy flags');
if (!Array.isArray(data.reviewedSpeechIds)) fail('reviewedSpeechIds');
if (data.reviewedSpeechIds.length !== expectedIds.length) fail(`reviewed count ${data.reviewedSpeechIds.length}/${expectedIds.length}`);
for (let i=0;i<expectedIds.length;i++) if (data.reviewedSpeechIds[i] !== expectedIds[i]) fail(`reviewed ID/order mismatch at ${i+1}`);
if (new Set(data.reviewedSpeechIds).size !== expectedIds.length) fail('duplicate reviewed ID');
const interpretations = data.interpretations || {};
const allowedKinds = new Set(['context','reaction','emotion','tone','joke','dramatic','reference']);
let noteCount = 0;
for (const [id, notes] of Object.entries(interpretations)) {
  if (!expectedSet.has(id)) fail(`interpretation outside scene: ${id}`);
  if (!Array.isArray(notes) || !notes.length) fail(`empty notes: ${id}`);
  const seen = new Set();
  for (const note of notes) {
    if (!allowedKinds.has(note?.kind)) fail(`bad kind: ${id}/${note?.kind}`);
    const text = String(note?.text || '').trim();
    if (!text) fail(`empty text: ${id}`);
    if (text.length > 360) fail(`note too long: ${id}/${text.length}`);
    const key = `${note.kind}\u0000${text}`;
    if (seen.has(key)) fail(`duplicate note: ${id}`);
    seen.add(key);
    noteCount++;
  }
}
const speechCount = Object.keys(interpretations).length;
if (data.qa?.reviewedSpeechCount !== expectedIds.length) fail('qa reviewedSpeechCount');
if (data.qa?.interpretationSpeechCount !== speechCount) fail('qa interpretationSpeechCount');
if (data.qa?.interpretationNoteCount !== noteCount) fail('qa interpretationNoteCount');
if (data.qa?.unreviewedSpeechCount !== 0) fail('qa unreviewedSpeechCount');
console.log(JSON.stringify({status:'PASS',sceneId,reviewed:expectedIds.length,interpretedSpeeches:speechCount,notes:noteCount,withoutInterpretation:expectedIds.length-speechCount},null,2));
