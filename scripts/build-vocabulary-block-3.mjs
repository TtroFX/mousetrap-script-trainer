import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const script = read('mousetrap_script_data.json');
const oldVocab = read('mousetrap_line_vocabulary.json');
const oldDict = read('mousetrap_word_dictionary.json');
const b1 = { ...(read('data/vocabulary-rebuild/block-1-dictionary.json').entries || {}), ...(read('data/vocabulary-rebuild/block-1-dictionary-supplement.json').entries || {}) };
const b2 = read('data/vocabulary-rebuild/block-2-dictionary.json').entries || {};
const seed = read('data/vocabulary-rebuild/block-3-neutral-seed.json').entries || {};

const blockId = 'block-3';
const sceneId = 'act1-scene2';
const first = 179;
const last = 336;
const speeches = script[sceneId].speeches.slice(first - 1, last);
const ids = new Set(speeches.map(s => s.id));
const norm = s => String(s || '').toLowerCase().normalize('NFKC').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

const additions = {
  'act1-scene2-speech-0183': [
    {surface:'police record', lemma:'police record', contextMeaning:'ここでは一般的な記録ではなく、警察が保有する過去の犯罪・捜査上の記録を指す。'},
    {surface:'fingerprints were on file', lemma:'on file', contextMeaning:'指紋が警察の記録として登録・保管されていたため、別名を使っていた女性の身元を確認できたという意味。'}
  ],
  'act1-scene2-speech-0187': [
    {surface:'in need of care and protection', lemma:'in need of care and protection', contextMeaning:'子どもを保護対象として扱う当時の法的・福祉的な表現で、単に「世話が必要」という日常表現ではない。'},
    {surface:'criminal neglect', lemma:'criminal neglect', contextMeaning:'子どもの死亡につながった、刑事責任を問われるほど重大な養育放棄・怠慢。'},
    {surface:'persistent ill-treatment', lemma:'persistent ill-treatment', contextMeaning:'一度きりではなく、継続して子どもをひどく扱っていたこと。'}
  ],
  'act1-scene2-speech-0189': [
    {surface:'served her sentence', lemma:'serve a sentence', contextMeaning:'Mrs. Stanningが裁判で科された刑期を服したこと。'}
  ],
  'act1-scene2-speech-0195': [
    {surface:'full particulars', lemma:'full particulars', contextMeaning:'館内にいる全員について、捜査に必要な詳しい身元・事情を集めるという警察上の意味。'},
    {surface:'take what measures I thought fit', lemma:'take measures', contextMeaning:'Trotter自身の判断で、館内の人々を守るため必要と考える対策を実施すること。'}
  ],
  'act1-scene2-speech-0203': [
    {surface:'far-fetched', lemma:'far-fetched', contextMeaning:'Casewellが、Monkswell Manorでさらに殺人が起きるという警察の見立てを「かなりありそうにない話」と感じている。'}
  ],
  'act1-scene2-speech-0206': [
    {surface:'Three Blind Mice', lemma:'Three Blind Mice', contextMeaning:'ここでは単なる童謡名ではなく、犯人が残した紙・楽譜に使われた反復的な印で、次の犯行を示唆する脅威のモチーフ。'}
  ],
  'act1-scene2-speech-0211': [
    {surface:'trace her present whereabouts', lemma:"trace someone's whereabouts", contextMeaning:'養女となったCorrigan家の少女が現在どこにいるのか、警察が追跡して確認すること。'},
    {surface:'Deserted from the Army', lemma:'desert from the army', contextMeaning:'軍を正式に退役したのではなく、無断で軍務から逃亡したこと。'},
    {surface:'queer in the head', lemma:'queer in the head', contextMeaning:'Trotterが当時のくだけた古い言い方で「精神状態がおかしい」と言い換えている。現在の中立的な医学用語ではなく、侮蔑的・時代的な表現。'}
  ],
  'act1-scene2-speech-0214': [
    {surface:'homicidal maniac', lemma:'homicidal maniac', contextMeaning:'Mollieが警察の推測を受けて「殺人をしかねない危険人物」という意味で恐怖を込めて言っている古い表現。臨床診断名として扱わない。'}
  ],
  'act1-scene2-speech-0226': [
    {surface:"What I'm getting at", lemma:'what someone is getting at', contextMeaning:'Trotterが「自分が突き止めたい要点は」と話を核心へ戻している。'},
    {surface:'deadly danger', lemma:'deadly danger', contextMeaning:'単なる大きな危険ではなく、誰かが殺される可能性があるという切迫した危険。'}
  ],
  'act1-scene2-speech-0227': [
    {surface:'bygone years', lemma:'bygone years', contextMeaning:'Longridge Farm事件が起きた過去の時期を、Paraviciniが距離を置いて「昔の地方の出来事」と表現している。'}
  ],
  'act1-scene2-speech-0236': [
    {surface:"you'll have yourself to blame", lemma:'have oneself to blame', contextMeaning:'情報を隠した結果だれかが被害に遭えば、自分たちにも責任がある、とTrotterが協力を迫る強い警告。'}
  ],
  'act1-scene2-speech-0237': [
    {surface:'hardboiled', lemma:'hardboiled', contextMeaning:'ChristopherがTrotterを「厳しくてタフな刑事らしい」と映画的・芝居がかった調子で面白がって評している。'}
  ],
  'act1-scene2-speech-0239': [
    {surface:'signature tune', lemma:'signature tune', contextMeaning:'ここでは通常のテーマ曲ではなく、「Three Blind Mice」が犯人を特徴づける署名のような反復モチーフだという意味。'},
    {surface:'what a kick he must be getting out of it', lemma:'get a kick out of', contextMeaning:'犯人が自分の仕掛けや周囲の恐怖から強い刺激・楽しみを得ているのだろう、とChristopherが想像している。事実として確認された心理ではない。'}
  ],
  'act1-scene2-speech-0245': [
    {surface:'neurotic young man', lemma:'neurotic', contextMeaning:'Mrs. BoyleがChristopherの不穏な冗談を非難して「神経質で異常な若者」と決めつける侮蔑的評価。医学的診断ではない。'}
  ],
  'act1-scene2-speech-0253': [
    {surface:'on the Bench', lemma:'on the Bench', contextMeaning:'Mrs. BoyleがLongridge Farm事件当時、治安判事として子どもの処遇決定に関与していたこと。普通のベンチに座る意味ではない。'}
  ],
  'act1-scene2-speech-0254': [
    {surface:'held responsible', lemma:'hold someone responsible', contextMeaning:'子どもをLongridge Farmへ送った結果について、自分に責任があるとみなされることをMrs. Boyleが否定している。'}
  ],
  'act1-scene2-speech-0258': [
    {surface:'public duty', lemma:'public duty', contextMeaning:'Mrs. Boyleが、治安判事として子どもの処遇を決めた行為を「社会のための公的な務め」と位置づけ、自分への非難を不当だと訴えている。'}
  ],
  'act1-scene2-speech-0263': [
    {surface:'spiv', lemma:'spiv', contextMeaning:'CasewellがParaviciniを、派手でいかがわしい闇商売人のように見えると評する当時の英国俗語。本人の実際の職業を断定しているわけではない。'}
  ],
  'act1-scene2-speech-0275': [
    {surface:'gets over things', lemma:'get over something', contextMeaning:'つらい過去の経験から時間とともに立ち直り、その影響を乗り越えるという心理的な意味。'}
  ],
  'act1-scene2-speech-0281': [
    {surface:'humbug', lemma:'humbug', contextMeaning:'Casewellが心理学者・精神科医の説明を「でたらめだ」と強く退けている。彼女の個人的態度であり、客観的評価ではない。'}
  ],
  'act1-scene2-speech-0283': [
    {surface:'hooey', lemma:'hooey', contextMeaning:'Casewellが心理学・精神医学の考え方全体を「くだらないでたらめ」と感情的に切り捨てる古い口語。'},
    {surface:"don't look back", lemma:'look back', contextMeaning:'過去のつらい出来事を振り返ったり、それにとらわれたりするな、という比喩。'}
  ],
  'act1-scene2-speech-0289': [
    {surface:"Don't give in", lemma:'give in', contextMeaning:'過去の記憶や苦痛に負けて支配されるな、という意味。'},
    {surface:'Turn your back on them', lemma:"turn one's back on", contextMeaning:'つらい過去の出来事を意識的に拒絶し、振り返らずに生きるという比喩。'}
  ],
  'act1-scene2-speech-0290': [
    {surface:'face them', lemma:'face something', contextMeaning:'過去のつらい出来事から逃げず、正面から認めて向き合うこと。'}
  ],
  'act1-scene2-speech-0296': [
    {surface:'get the lay of the land', lemma:'get the lay of the land', contextMeaning:'Trotterが捜査・警備のため、館内の部屋配置や出入りの構造を把握すること。土地そのものを調べる意味ではない。'}
  ],
  'act1-scene2-speech-0311': [
    {surface:'turned up out of the blue', lemma:'out of the blue', contextMeaning:'Paraviciniが事前予約なしに、まったく予期せず突然Monkswell Manorへ現れたこと。'}
  ],
  'act1-scene2-speech-0312': [
    {surface:'reliance to be placed on', lemma:'place reliance on', contextMeaning:'住所や配給手帳のような情報だけでは、宿泊客の本当の身元を保証する証拠として十分信用できない、という捜査上の意味。'}
  ],
  'act1-scene2-speech-0314': [
    {surface:"he's here already", lemma:'here already', contextMeaning:'雪で外から誰も来られないから安全なのではなく、犯人が前夜から宿泊客の一人としてすでに館内にいる可能性をTrotterが示している。'}
  ],
  'act1-scene2-speech-0324': [
    {surface:'indeterminate build', lemma:'indeterminate build', contextMeaning:'目撃情報から体格をはっきり特定できず、容疑者を絞る特徴にならないという意味。'},
    {surface:'muffler', lemma:'muffler', contextMeaning:'ここでは自動車部品ではなく、顔を隠すように巻いた防寒用の厚手のスカーフ。'}
  ],
  'act1-scene2-speech-0334': [
    {surface:'mechanics of fear', lemma:'mechanics of fear', contextMeaning:'ラジオ番組が説明する「恐怖が人の心にどう作用するかという仕組み」。直後の暗闇と物音を不穏に先取りするが、語義自体は心理的な仕組みを指す。'}
  ]
};

const context = {};
const threshold = {};
const selected = new Map();
const pair = new Set();
const fallbacks = {};
function add(target, speechId, item) {
  if (!ids.has(speechId)) throw new Error(`Out-of-range speech: ${speechId}`);
  const k = `${speechId}|${norm(item.surface)}|${item.lemma}`;
  if (pair.has(k)) return;
  pair.add(k);
  (target[speechId] ||= []).push(item);
  selected.set(item.lemma, selected.get(item.lemma) || null);
}
for (const [speechId, items] of Object.entries(additions)) for (const item of items) add(context, speechId, item);

for (const speech of speeches) {
  for (const legacy of oldVocab[speech.id] || []) {
    const surface = String(legacy.surface || '').trim();
    const lemma = String(legacy.lemma || surface).trim();
    if (!surface || !lemma) continue;
    const sameSurfaceContext = (context[speech.id] || []).some(x => norm(x.surface) === norm(surface));
    if (sameSurfaceContext) continue;
    add(threshold, speech.id, { surface, lemma, contextMeaning: '' });
  }
}

function neutralFor(lemma) {
  const direct = b2[lemma] || b1[lemma] || seed[lemma];
  if (direct?.meaning) return { pos: direct.pos || '未分類', meaning: direct.meaning, ...(direct.tags?.length ? {tags:direct.tags} : {}) };
  const old = oldDict[lemma];
  if (old?.coreMeaning) return { pos: old.pos || '未分類', meaning: old.coreMeaning, ...(old.tags?.length ? {tags:old.tags} : {}) };
  for (const entries of Object.values(oldVocab)) {
    const hit = (entries || []).find(x => x.lemma === lemma && String(x.meaning || '').trim());
    if (hit) {
      fallbacks[lemma] = { pos: old?.pos || '未分類', meaning: hit.meaning, reason:'No neutral dictionary entry; legacy line meaning used only as temporary fallback.' };
      return { pos: old?.pos || '未分類', meaning: hit.meaning, tags:['needs-neutral-review'] };
    }
  }
  throw new Error(`No neutral meaning available for selected lemma: ${lemma}`);
}
const dictionary = {};
for (const lemma of selected.keys()) dictionary[lemma] = neutralFor(lemma);

const base = { schemaVersion:2, blockId, sceneId, processedSpeechRange:[first,last], processedSpeechCount:speeches.length };
write('data/vocabulary-rebuild/block-3-line-vocabulary.json', { ...base, policy:'Context-specific meanings first; blank means neutral dictionary sense is sufficient.', lines:context });
write('data/vocabulary-rebuild/block-3-b1plus-coverage.json', { ...base, policy:'Legacy candidates plus later CEFR B1+ audit additions. contextMeaning must remain blank.', lines:threshold });
write('data/vocabulary-rebuild/block-3-dictionary.json', { schemaVersion:2, blockId, policy:'Neutral shared meanings only; no play-specific context.', entries:dictionary });
write('data/vocabulary-rebuild/block-3-dictionary-supplement.json', { schemaVersion:2, blockId, entries:{} });
write('data/vocabulary-rebuild/block-3-neutral-fallbacks.json', { schemaVersion:1, blockId, count:Object.keys(fallbacks).length, entries:fallbacks });
console.log(JSON.stringify({ speeches:speeches.length, contextEntries:Object.values(context).flat().length, thresholdEntries:Object.values(threshold).flat().length, lemmas:Object.keys(dictionary).length, neutralFallbacks:Object.keys(fallbacks).length }, null, 2));
