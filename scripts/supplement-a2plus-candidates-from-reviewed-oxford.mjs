import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const norm = s => String(s ?? '').toLowerCase().normalize('NFKC').replace(/[‘’]/g, "'").trim();

const dictionary = read('mousetrap_word_dictionary.json');
const script = read('mousetrap_script_data.json');
const summaryPath = 'data/a2plus-candidate-lists/summary.json';
const part2Path = 'data/a2plus-candidate-lists/part-02.txt';
const combinedPath = 'data/a2plus-candidate-lists/part-01-02-unique.txt';
const reviewedPath = 'data/vocabulary-rebuild/block-3-oxford-review.json';

const summary = read(summaryPath);
if (Object.keys(dictionary).some(k => norm(k) === 'abuse')) throw new Error('abuse is already implemented in current dictionary; supplement no longer needed');

const speech = script['act1-scene2'].speeches.find(s => s.id === 'act1-scene2-speech-0258');
if (!speech || !/\babuse\b/i.test(speech.text)) throw new Error('Canonical abuse occurrence not found');

const reviewed = read(reviewedPath);
const lexeme = (reviewed.includeLexemes || []).find(x => norm(x.word) === 'abuse' || norm(x.lemma) === 'abuse');
if (!lexeme || String(lexeme.cefr || '').toUpperCase() !== 'C1') throw new Error('Reviewed Oxford C1 classification for abuse not found');

if (!summary.abusePresentInFinal) {
  const rowPart2 = 'abuse\tC1\t1\tact1-scene2-speech-0258\tabuse\tC1';
  const rowCombined = 'abuse\tC1\t2\t1\tact1-scene2-speech-0258\tabuse\tC1';

  let part2 = fs.readFileSync(part2Path, 'utf8');
  const marker2 = '\nOXFORD-UNCLASSIFIED / MANUAL REVIEW\n';
  if (!part2.includes(marker2)) throw new Error('Part 2 insertion marker missing');
  if (!part2.includes('\nabuse\tC1\t')) part2 = part2.replace(marker2, `\n${rowPart2}${marker2}`);
  fs.writeFileSync(part2Path, part2);

  let combined = fs.readFileSync(combinedPath, 'utf8');
  if (!combined.includes('\nabuse\tC1\t')) combined += `${rowCombined}\n`;
  combined = combined.replace(/Unique final Oxford A2\+ candidates across Parts 1\+2: \d+/, `Unique final Oxford A2+ candidates across Parts 1+2: ${summary.uniqueOxfordA2PlusAcrossParts1And2 + 1}`);
  fs.writeFileSync(combinedPath, combined);

  summary.parts.part2.finalOxfordA2Plus += 1;
  summary.uniqueOxfordA2PlusAcrossParts1And2 += 1;
  summary.abusePresentInFinal = true;
  summary.reviewedOxfordSupplements = [{ word: 'abuse', cefr: 'C1', speechId: 'act1-scene2-speech-0258', source: reviewedPath }];
  summary.policy += ' Stored reviewed Oxford classifications are used as a fallback when the live Oxford HTML parser misses a previously verified headword.';
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
}

if (!summary.abusePresentInFinal) throw new Error('abuse supplement failed');
console.log(JSON.stringify({ status: 'PASS', abusePresentInFinal: true, unique: summary.uniqueOxfordA2PlusAcrossParts1And2 }, null, 2));
