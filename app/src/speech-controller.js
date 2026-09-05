const DEFAULT_LANG = 'en-GB';
const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
const hasUtterance = typeof window !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
const events = new EventTarget();

let voices = [];
let current = null;
let generation = 0;

const normalizeLang = value => String(value || '').trim().replace(/_/g, '-').toLowerCase();
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

function refreshVoices() {
  if (!synth?.getVoices) return [];
  try {
    voices = Array.from(synth.getVoices() || []);
  } catch {
    voices = [];
  }
  events.dispatchEvent(new CustomEvent('voices', { detail: diagnostics() }));
  return voices;
}

function voiceScore(voice, lang = DEFAULT_LANG) {
  const wanted = normalizeLang(lang);
  const actual = normalizeLang(voice?.lang);
  const name = String(voice?.name || '').toLowerCase();
  let score = 0;

  if (actual === wanted) score += 1000;
  else if (wanted.startsWith('en-') && actual.startsWith('en-')) score += 450;
  else if (actual && actual.split('-')[0] === wanted.split('-')[0]) score += 250;
  else return -1;

  if (voice?.localService === true) score += 120;
  if (/british|united kingdom|\buk\b|england/.test(name)) score += 80;
  if (voice?.default === true) score += 10;
  return score;
}

function preferredVoice(lang = DEFAULT_LANG) {
  if (!voices.length) refreshVoices();
  let best = null;
  let bestScore = -1;
  for (const voice of voices) {
    const score = voiceScore(voice, lang);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

function supported() {
  return !!(synth && hasUtterance && typeof synth.speak === 'function');
}

function isSpeaking(owner = null) {
  if (!current) return false;
  return owner == null || current.owner === owner;
}

function cancel(owner = null) {
  if (!synth) return false;
  if (owner != null && current?.owner !== owner) return false;
  generation += 1;
  current = null;
  try {
    synth.cancel();
  } catch {
    return false;
  }
  events.dispatchEvent(new CustomEvent('state', { detail: { state: 'idle', owner: null } }));
  return true;
}

function speak({
  text,
  owner = 'default',
  lang = DEFAULT_LANG,
  rate = 1,
  pitch = 1,
  volume = 1,
  onStart,
  onEnd,
  onError,
} = {}) {
  const value = String(text || '').trim();
  if (!value || !supported()) return false;

  cancel();
  const id = ++generation;
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = lang;
  utterance.rate = clamp(rate, 0.1, 10, 1);
  utterance.pitch = clamp(pitch, 0, 2, 1);
  utterance.volume = clamp(volume, 0, 1, 1);

  const voice = preferredVoice(lang);
  if (voice) utterance.voice = voice;

  current = { id, owner, utterance, voice: voice || null };
  utterance.onstart = event => {
    if (current?.id !== id) return;
    events.dispatchEvent(new CustomEvent('state', { detail: { state: 'speaking', owner, voice: voiceInfo(voice) } }));
    onStart?.(event);
  };
  utterance.onend = event => {
    if (current?.id !== id) return;
    current = null;
    events.dispatchEvent(new CustomEvent('state', { detail: { state: 'idle', owner: null } }));
    onEnd?.(event);
  };
  utterance.onerror = event => {
    if (current?.id !== id) return;
    current = null;
    events.dispatchEvent(new CustomEvent('state', { detail: { state: 'idle', owner: null, error: event?.error || 'speech-error' } }));
    onError?.(event);
  };

  try {
    synth.speak(utterance);
    return true;
  } catch (error) {
    if (current?.id === id) current = null;
    events.dispatchEvent(new CustomEvent('state', { detail: { state: 'idle', owner: null, error: 'speak-threw' } }));
    onError?.(error);
    return false;
  }
}

function voiceInfo(voice) {
  if (!voice) return null;
  return {
    name: voice.name || '',
    lang: voice.lang || '',
    localService: voice.localService === true,
    default: voice.default === true,
    voiceURI: voice.voiceURI || '',
  };
}

function diagnostics() {
  const preferred = preferredVoiceWithoutRefresh(DEFAULT_LANG);
  return {
    supported: supported(),
    voiceCount: voices.length,
    preferredVoice: voiceInfo(preferred),
    speaking: !!current,
    owner: current?.owner || null,
  };
}

function preferredVoiceWithoutRefresh(lang = DEFAULT_LANG) {
  let best = null;
  let bestScore = -1;
  for (const voice of voices) {
    const score = voiceScore(voice, lang);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

export const speechController = Object.freeze({
  DEFAULT_LANG,
  supported,
  speak,
  cancel,
  isSpeaking,
  refreshVoices,
  preferredVoice,
  diagnostics,
  addEventListener: (...args) => events.addEventListener(...args),
  removeEventListener: (...args) => events.removeEventListener(...args),
});

refreshVoices();
if (synth?.addEventListener) synth.addEventListener('voiceschanged', refreshVoices);

// A route change must never leave an utterance from the previous screen playing.
window.addEventListener('hashchange', () => cancel());
window.addEventListener('pagehide', () => cancel());

// Exposed only for diagnostics and the later Line Detail read-aloud control.
window.MTS_SPEECH = speechController;
