const comparable = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[「」『』“”‘’"'。、，,:：;；!！?？\s]/g, '');
const sameText = (a, b) => !!String(a || '').trim() && !!String(b || '').trim() && comparable(a) === comparable(b);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function createDictionarySheet({ store, normalize, setStatus, openLine }) {
  const overlay = document.getElementById('word-overlay');
  const content = document.getElementById('word-content');
  const closeButton = document.getElementById('word-close');

  function close() {
    window.MTS_GESTURES?.resetSheet?.();
    overlay.hidden = true;
  }

  async function open(line, lemma, surface) {
    const speech = store.getSpeechById(line);
    if (!speech) return;
    if (!store.hasStudy()) {
      setStatus('Loading dictionary…');
      try { await store.loadStudy(); setStatus(); }
      catch { setStatus('Dictionary data could not be loaded.', 'warning'); return; }
    }

    const entry = store.getDictionary(lemma);
    const shown = store.getVocabulary(line);
    const vocab = shown.find(v => normalize(v.lemma) === normalize(lemma) && (!surface || normalize(v.surface) === normalize(surface))) || shown.find(v => normalize(v.lemma) === normalize(lemma));
    const scene = store.getSceneIdForSpeech(line);
    const meaning = String(entry?.meaning || vocab?.meaning || entry?.coreMeaning || '').trim();
    const inThisPlay = String(vocab?.inThisPlay || '').trim();
    const forms = String(entry?.forms || '').trim();

    const header = el('header');
    header.append(el('div', 'eyebrow', 'Dictionary'));
    header.append(el('h2', '', surface || vocab?.surface || entry?.lemma || lemma));
    const meta = [entry?.lemma || lemma, entry?.pos, entry?.ipa].filter(Boolean).join(' · ');
    header.append(el('p', '', meta));

    const dictionaryCard = el('section', 'word-dict-card');
    dictionaryCard.append(el('h3', '', 'Word dictionary'));
    const dl = el('dl');
    const add = (label, value) => {
      const text = String(value || '').trim();
      if (!text) return;
      dl.append(el('dt', '', label), el('dd', '', text));
    };
    add('Meaning', meaning);
    add('In this play', inThisPlay);
    add('Forms', forms);
    if (dl.children.length) dictionaryCard.append(dl);
    else dictionaryCard.append(el('p', 'muted', 'Dictionary information not found.'));

    const contextCard = el('section', 'word-context-card');
    contextCard.append(el('h3', '', 'In this line'));
    contextCard.append(el('p', 'context-en', speech.text));
    contextCard.append(el('p', '', store.getTranslation(line) || 'No translation available.'));
    const openButton = el('button', 'ghost-btn', 'Open Line Detail');
    openButton.type = 'button';
    openButton.addEventListener('click', () => { close(); openLine(scene, line); });
    contextCard.append(openButton);

    content.replaceChildren(header, dictionaryCard, contextCard);
    window.MTS_GESTURES?.resetSheet?.();
    overlay.hidden = false;
  }

  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !overlay.hidden) close(); });
  return Object.freeze({ open, close });
}
