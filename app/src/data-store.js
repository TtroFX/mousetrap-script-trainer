import { DATA_PATHS, SCENES, CORE_TIMEOUT_MS, STUDY_TIMEOUT_MS, STRUCTURE_TIMEOUT_MS } from './config.js';

const now = () => (globalThis.performance?.now ? performance.now() : Date.now());
function createState() { return { status: 'idle', error: null, startedAt: 0, finishedAt: 0 }; }

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin', cache: 'default' });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`${url}: timeout after ${timeoutMs}ms`);
    throw error;
  } finally { clearTimeout(timer); }
}

function validateScript(script) {
  if (!script || typeof script !== 'object' || Array.isArray(script)) throw new Error('script: object required');
  let total = 0;
  for (const scene of SCENES) {
    const rows = script[scene.id]?.speeches;
    if (!Array.isArray(rows) || rows.length !== scene.count) throw new Error(`script.${scene.id}: ${rows?.length ?? 0}/${scene.count}`);
    for (let i = 0; i < rows.length; i += 1) {
      const speech = rows[i], expected = `${scene.id}-speech-${String(i + 1).padStart(4, '0')}`;
      if (speech?.id !== expected || !String(speech?.speaker || '').trim() || !String(speech?.text || '').trim()) throw new Error(`script.${scene.id}: invalid speech #${i + 1}`);
    }
    total += rows.length;
  }
  if (total !== 1164) throw new Error(`script total ${total}/1164`);
  return script;
}

function expectedSpeechIds() {
  const ids = [];
  for (const scene of SCENES) for (let i = 1; i <= scene.count; i += 1) ids.push(`${scene.id}-speech-${String(i).padStart(4, '0')}`);
  return ids;
}

function validateSpeechMap(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name}: object required`);
  const expected = new Set(expectedSpeechIds());
  const keys = Object.keys(value);
  if (keys.length !== 1164 || keys.some(key => !expected.has(key))) throw new Error(`${name}: speech coverage invalid`);
  return value;
}

const INTERPRETATION_KINDS = new Set(['context','reaction','emotion','tone','joke','dramatic','reference','foreshadowing','truth','lie','concealment','feignedIgnorance','misdirection','evasion','mistakenBelief']);
function validateInterpretation(value) {
  validateSpeechMap(value, 'interpretation');
  for (const [lineId, notes] of Object.entries(value)) {
    if (!Array.isArray(notes)) throw new Error(`interpretation.${lineId}: array required`);
    const seen = new Set();
    for (const note of notes) {
      const kind = String(note?.kind || '');
      const text = String(note?.text || '').trim();
      if (!INTERPRETATION_KINDS.has(kind)) throw new Error(`interpretation.${lineId}: invalid kind ${kind}`);
      if (!text || text.length > 360) throw new Error(`interpretation.${lineId}: invalid text`);
      const key = `${kind}\u0000${text}`;
      if (seen.has(key)) throw new Error(`interpretation.${lineId}: duplicate note`);
      seen.add(key);
    }
  }
  return value;
}

function validateVocabulary(value) {
  validateSpeechMap(value, 'vocabulary');
  for (const [lineId, rows] of Object.entries(value)) {
    if (!Array.isArray(rows)) throw new Error(`vocabulary.${lineId}: array required`);
    const seen = new Set();
    for (const entry of rows) {
      const surface = String(entry?.surface || '').trim();
      const lemma = String(entry?.lemma || '').trim();
      const meaning = String(entry?.meaning || '').trim();
      if (!surface || !lemma || !meaning) throw new Error(`vocabulary.${lineId}: surface/lemma/meaning required`);
      if (typeof entry.playMeaning !== 'boolean') throw new Error(`vocabulary.${lineId}: playMeaning boolean required`);
      const key = `${surface.toLowerCase()}\u0000${lemma.toLowerCase()}`;
      if (seen.has(key)) throw new Error(`vocabulary.${lineId}: duplicate ${surface}/${lemma}`);
      seen.add(key);
    }
  }
  return value;
}

function validateDictionary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('dictionary: object required');
  if (Object.keys(value).length < 578) throw new Error(`dictionary: unexpectedly small (${Object.keys(value).length})`); for (const [key, entry] of Object.entries(value)) if (!String(key).trim() || !entry || typeof entry !== 'object' || !String(entry.coreMeaning || '').trim()) throw new Error(`dictionary: invalid entry ${key}`);
  return value;
}

function validateStructure(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('structure: object required');
  if (value.schemaVersion !== 2 || value.ruleSet !== 'chunking-v1') throw new Error('structure: chunking-v1 schema required');
  if ('rawLines' in value) throw new Error('structure: legacy rawLines/fallback is forbidden');
  const counts = value.counts || {};
  if (counts.speeches !== 1164 || counts.sentences !== 2334 || counts.clauses !== 2939 || counts.chunks !== 11810) {
    throw new Error(`structure: canonical counts invalid (${counts.speeches ?? 0}/${counts.sentences ?? 0}/${counts.clauses ?? 0}/${counts.chunks ?? 0})`);
  }
  const lines = value.lines;
  if (!lines || typeof lines !== 'object' || Array.isArray(lines)) throw new Error('structure.lines: object required');
  const expected = expectedSpeechIds();
  const keys = Object.keys(lines);
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) throw new Error('structure.lines: speech IDs/order invalid');
  const clauseMarker = /^(BC|AC|NC|RC)\d+$/;
  const roleMarker = /^(S|V|O|C)\d+[a-z]?$/;
  const allowedUnnumbered = new Set(['HV','ACC','Conj','N','Adj','Adv','Prep','Voc','Int','Resp','Frag','Other']);
  for (const lineId of expected) {
    const line = lines[lineId];
    if (!line || !Number.isInteger(line.speechLength) || line.speechLength < 1 || !Array.isArray(line.sentences) || !line.sentences.length) throw new Error(`structure.${lineId}: invalid line`);
    for (const sentence of line.sentences) {
      if (!Number.isInteger(sentence.start) || !Number.isInteger(sentence.end) || sentence.start < 0 || sentence.end <= sentence.start || sentence.end > line.speechLength) throw new Error(`structure.${lineId}: invalid sentence span`);
      if (!['sentence','fragment'].includes(sentence.kind) || !Array.isArray(sentence.clauses) || !Array.isArray(sentence.chunks)) throw new Error(`structure.${lineId}: invalid sentence payload`);
      const clauseIds = new Set(sentence.clauses.map(c => c?.id).filter(Boolean));
      for (const clause of sentence.clauses) {
        if (!clauseMarker.test(String(clause?.marker || '')) || !clauseIds.has(clause.id)) throw new Error(`structure.${lineId}: invalid clause`);
        if (clause.parentClauseId === clause.id) throw new Error(`structure.${lineId}: self-parent clause`);
        if (clause.parentClauseId != null && !clauseIds.has(clause.parentClauseId)) throw new Error(`structure.${lineId}: orphan clause parent`);
      }
      for (const chunk of sentence.chunks) {
        const marker = String(chunk?.marker || '');
        if (!Number.isInteger(chunk.start) || !Number.isInteger(chunk.end) || chunk.start < 0 || chunk.end <= chunk.start || chunk.end > sentence.end - sentence.start) throw new Error(`structure.${lineId}: invalid chunk span`);
        if (!roleMarker.test(marker) && !allowedUnnumbered.has(marker)) throw new Error(`structure.${lineId}: unknown marker ${marker}`);
        if (/^(Vi|Vt)/.test(marker) || marker.includes('VBN') || /^HV\d/.test(marker)) throw new Error(`structure.${lineId}: legacy marker ${marker}`);
      }
    }
  }
  return value;
}

export class DataStore extends EventTarget {
  constructor() {
    super();
    this.script = null; this.translations = null; this.interpretation = null; this.vocabulary = null; this.grammar = null; this.dictionary = null; this.structure = null;
    this.coreState = createState(); this.studyState = createState(); this.structureState = createState();
    this.corePromise = null; this.studyPromise = null; this.structurePromise = null;
    this.speechById = new Map(); this.sceneBySpeech = new Map();
    this.metrics = { requests: 0, failures: 0, coreMs: null, studyMs: null, structureMs: null };
  }
  emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  async loadCore({ force = false } = {}) {
    if (this.coreState.status === 'ready' && !force) return this.script;
    if (this.corePromise && !force) return this.corePromise;
    this.coreState = { ...createState(), status: 'loading', startedAt: now() }; this.emit('state', { area: 'core', state: this.coreState });
    this.corePromise = (async () => {
      try {
        this.metrics.requests += 1;
        const script = validateScript(await fetchJson(DATA_PATHS.script, CORE_TIMEOUT_MS));
        this.script = script; this.speechById.clear(); this.sceneBySpeech.clear();
        for (const scene of SCENES) for (const speech of script[scene.id].speeches) { this.speechById.set(speech.id, speech); this.sceneBySpeech.set(speech.id, scene.id); }
        this.coreState.status = 'ready'; this.coreState.error = null; this.coreState.finishedAt = now(); this.metrics.coreMs = Math.round(this.coreState.finishedAt - this.coreState.startedAt); this.emit('ready', { area: 'core' });
        return script;
      } catch (error) {
        this.metrics.failures += 1; this.coreState.status = 'error'; this.coreState.error = error; this.coreState.finishedAt = now(); this.emit('error', { area: 'core', error }); throw error;
      } finally { this.corePromise = null; }
    })();
    return this.corePromise;
  }

  async loadStudy({ force = false } = {}) {
    if (this.studyState.status === 'ready' && !force) return this.studySnapshot();
    if (this.studyPromise && !force) return this.studyPromise;
    this.studyState = { ...createState(), status: 'loading', startedAt: now() }; this.emit('state', { area: 'study', state: this.studyState });
    this.studyPromise = (async () => {
      const specs = [['translations', DATA_PATHS.translations, value => validateSpeechMap(value, 'translations')], ['interpretation', DATA_PATHS.interpretation, validateInterpretation], ['vocabulary', DATA_PATHS.vocabulary, validateVocabulary], ['grammar', DATA_PATHS.grammar, value => validateSpeechMap(value, 'grammar')], ['dictionary', DATA_PATHS.dictionary, validateDictionary]];
      try {
        const settled = await Promise.allSettled(specs.map(async ([key, url, validator]) => { this.metrics.requests += 1; const value = validator(await fetchJson(url, STUDY_TIMEOUT_MS)); this[key] = value; return key; }));
        const failed = settled.map((result, index) => ({ result, key: specs[index][0] })).filter(x => x.result.status === 'rejected');
        if (failed.length) { this.metrics.failures += failed.length; const error = new Error(`study data unavailable: ${failed.map(x => x.key).join(', ')}`); error.causes = failed.map(x => x.result.reason); throw error; }
        this.studyState.status = 'ready'; this.studyState.error = null; this.studyState.finishedAt = now(); this.metrics.studyMs = Math.round(this.studyState.finishedAt - this.studyState.startedAt); this.emit('ready', { area: 'study' }); return this.studySnapshot();
      } catch (error) { this.studyState.status = 'error'; this.studyState.error = error; this.studyState.finishedAt = now(); this.emit('error', { area: 'study', error }); throw error; }
      finally { this.studyPromise = null; }
    })();
    return this.studyPromise;
  }

  async loadStructure({ force = false } = {}) {
    if (this.structureState.status === 'ready' && !force) return this.structure;
    if (this.structurePromise && !force) return this.structurePromise;
    this.structureState = { ...createState(), status: 'loading', startedAt: now() }; this.emit('state', { area: 'structure', state: this.structureState });
    this.structurePromise = (async () => {
      try { this.metrics.requests += 1; this.structure = validateStructure(await fetchJson(DATA_PATHS.structure, STRUCTURE_TIMEOUT_MS)); this.structureState.status = 'ready'; this.structureState.error = null; this.structureState.finishedAt = now(); this.metrics.structureMs = Math.round(this.structureState.finishedAt - this.structureState.startedAt); this.emit('ready', { area: 'structure' }); return this.structure; }
      catch (error) { this.metrics.failures += 1; this.structureState.status = 'error'; this.structureState.error = error; this.structureState.finishedAt = now(); this.emit('error', { area: 'structure', error }); throw error; }
      finally { this.structurePromise = null; }
    })();
    return this.structurePromise;
  }

  studySnapshot() { return { translations: this.translations, interpretation: this.interpretation, vocabulary: this.vocabulary, grammar: this.grammar, dictionary: this.dictionary }; }
  hasCore() { return this.coreState.status === 'ready' && !!this.script; }
  hasStudy() { return this.studyState.status === 'ready'; }
  hasStructure() { return this.structureState.status === 'ready'; }
  getScene(sceneId) { return this.script?.[sceneId]?.speeches || []; }
  getSpeech(sceneId, lineId) { return this.getScene(sceneId).find(x => x.id === lineId) || null; }
  getSpeechById(lineId) { return this.speechById.get(lineId) || null; }
  getSceneIdForSpeech(lineId) { return this.sceneBySpeech.get(lineId) || null; }
  getTranslation(lineId) { return this.translations?.[lineId]?.translation || ''; }
  getTranslationRecord(lineId) { return this.translations?.[lineId] || null; }
  getInterpretation(lineId) { return Array.isArray(this.interpretation?.[lineId]) ? this.interpretation[lineId] : []; }
  getVocabulary(lineId) { return Array.isArray(this.vocabulary?.[lineId]) ? this.vocabulary[lineId].filter(entry => entry?.playMeaning === true) : []; }
  getVocabularyAll(lineId) { return Array.isArray(this.vocabulary?.[lineId]) ? this.vocabulary[lineId] : []; }
  getGrammar(lineId) { return Array.isArray(this.grammar?.[lineId]) ? this.grammar[lineId] : []; }
  getDictionary(lemma) { if (!this.dictionary || !lemma) return null; if (this.dictionary[lemma]) return this.dictionary[lemma]; const target = String(lemma).trim().toLowerCase(); const key = Object.keys(this.dictionary).find(k => k.trim().toLowerCase() === target); return key ? this.dictionary[key] : null; }
  getStructure(lineId) { return this.structure?.lines?.[lineId] || null; }
  diagnostics() { return { core: { ...this.coreState, error: this.coreState.error ? String(this.coreState.error.message || this.coreState.error) : null }, study: { ...this.studyState, error: this.studyState.error ? String(this.studyState.error.message || this.studyState.error) : null }, structure: { ...this.structureState, error: this.structureState.error ? String(this.structureState.error.message || this.structureState.error) : null }, metrics: { ...this.metrics } }; }
}
