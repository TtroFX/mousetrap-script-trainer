import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const supplement = read('data/vocabulary-rebuild/block-5-neutral-supplement.json').entries || {};
const dictPath = 'data/vocabulary-rebuild/block-5-dictionary.json';
const fallbackPath = 'data/vocabulary-rebuild/block-5-neutral-fallbacks.json';
const dict = read(dictPath);
const fallback = read(fallbackPath);
for (const [lemma, entry] of Object.entries(supplement)) {
  if (dict.entries?.[lemma]) dict.entries[lemma] = entry;
  if (fallback.entries?.[lemma]) delete fallback.entries[lemma];
}
fallback.count = Object.keys(fallback.entries || {}).length;
write(dictPath, dict);
write(fallbackPath, fallback);
console.log(JSON.stringify({applied:Object.keys(supplement).length, remainingFallbacks:fallback.count}, null, 2));
