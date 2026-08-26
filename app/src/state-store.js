import { CAST, SCENES, STORAGE_KEYS, READER_MODES, RATING_VALUES } from './config.js';

const sceneIds = new Set(SCENES.map(x => x.id));
const safeParse = (raw, fallback) => { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
const safeGet = key => { try { return localStorage.getItem(key); } catch { return null; } };
const safeSet = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
const safeRemove = key => { try { localStorage.removeItem(key); } catch {} };
const jsonSet = (key, value) => safeSet(key, JSON.stringify(value));
const stamp = () => new Date().toISOString();
const timeValue = value => Number.isFinite(Date.parse(value || '')) ? Date.parse(value) : 0;

export class StateStore extends EventTarget {
  constructor(dataStore) { super(); this.data = dataStore; }
  emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  selectedScene() { const value = safeGet(STORAGE_KEYS.selectedScene); return sceneIds.has(value) ? value : SCENES[0].id; }
  setScene(sceneId) { const value = sceneIds.has(sceneId) ? sceneId : SCENES[0].id; safeSet(STORAGE_KEYS.selectedScene, value); this.emit('change', { key: 'scene', value }); return value; }
  role() { const value = safeGet(STORAGE_KEYS.character) || ''; return CAST.includes(value) ? value : ''; }
  setRole(role) { if (!CAST.includes(role)) return false; safeSet(STORAGE_KEYS.character, role); this.emit('change', { key: 'role', value: role }); return true; }
  readerMode() { const value = safeGet(STORAGE_KEYS.readerMode) || 'full'; return READER_MODES.includes(value) ? value : 'full'; }
  setReaderMode(mode) { const value = READER_MODES.includes(mode) ? mode : 'full'; safeSet(STORAGE_KEYS.readerMode, value); this.emit('change', { key: 'readerMode', value }); return value; }

  resumeState() {
    const raw = safeParse(safeGet(STORAGE_KEYS.resume), {}) || {};
    return { version: 1, script: raw.script || null, cue: raw.cue || null, rehearsal: raw.rehearsal || null, lineDetail: raw.lineDetail || null, updatedAt: raw.updatedAt || '' };
  }
  saveResume(kind, payload) {
    if (!['script', 'cue', 'rehearsal', 'lineDetail'].includes(kind)) return false;
    const all = this.resumeState(), updatedAt = stamp();
    all[kind] = { ...payload, kind, updatedAt };
    all.updatedAt = updatedAt;
    jsonSet(STORAGE_KEYS.resume, all);
    this.emit('change', { key: 'resume', kind, value: all[kind] });
    return all[kind];
  }
  latestResume() {
    const all = this.resumeState();
    const entries = [all.script, all.cue, all.rehearsal, all.lineDetail].filter(x => x && !x.completed);
    return entries.sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt))[0] || null;
  }
  latestPracticeResume() {
    const all = this.resumeState();
    return [all.cue, all.rehearsal].filter(x => x && !x.completed).sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt))[0] || null;
  }

  bookmarks() { const raw = safeParse(safeGet(STORAGE_KEYS.bookmarks), {}) || {}; return raw && typeof raw === 'object' ? raw : {}; }
  isBookmarked(lineId) { return !!this.bookmarks()[lineId]; }
  addBookmark(sceneId, lineId, createdAt = stamp()) {
    if (!sceneIds.has(sceneId) || !lineId || (this.data.hasCore() && !this.data.getSpeech(sceneId, lineId))) return false;
    const all = this.bookmarks();
    all[lineId] = { lineId, sceneId, createdAt: all[lineId]?.createdAt || createdAt };
    jsonSet(STORAGE_KEYS.bookmarks, all);
    this.emit('change', { key: 'bookmark', action: 'add', value: all[lineId] });
    return all[lineId];
  }
  removeBookmark(lineId) {
    const all = this.bookmarks(), old = all[lineId];
    if (!old) return false;
    delete all[lineId];
    jsonSet(STORAGE_KEYS.bookmarks, all);
    this.emit('change', { key: 'bookmark', action: 'remove', value: old });
    return old;
  }
  restoreBookmark(entry) { return entry?.lineId ? this.addBookmark(entry.sceneId, entry.lineId, entry.createdAt) : false; }
  toggleBookmark(sceneId, lineId) { return this.isBookmarked(lineId) ? { bookmarked: false, removed: this.removeBookmark(lineId) } : { bookmarked: true, entry: this.addBookmark(sceneId, lineId) }; }

  readerProgress() { const p = safeParse(safeGet(STORAGE_KEYS.readerProgress), {}) || {}; return { version: 1, globalSeen: Array.isArray(p.globalSeen) ? p.globalSeen : [], roles: p.roles && typeof p.roles === 'object' ? p.roles : {}, last: p.last && typeof p.last === 'object' ? p.last : null, updatedAt: p.updatedAt || '' }; }
  markReaderSeen(sceneId, lineId) {
    const speech = this.data.getSpeech(sceneId, lineId); if (!speech) return false;
    const p = this.readerProgress(), role = this.role();
    if (!p.globalSeen.includes(lineId)) p.globalSeen.push(lineId);
    if (role && speech.speaker === role) { if (!Array.isArray(p.roles[role])) p.roles[role] = []; if (!p.roles[role].includes(lineId)) p.roles[role].push(lineId); }
    const updatedAt = stamp(); p.last = { sceneId, lineId, role, updatedAt }; p.updatedAt = updatedAt;
    jsonSet(STORAGE_KEYS.readerProgress, p); jsonSet(STORAGE_KEYS.readerLast, p.last); jsonSet(STORAGE_KEYS.lineCurrent, { sceneId, lineId });
    this.saveResume('script', { sceneId, lineId, role, readerMode: this.readerMode() });
    this.saveResume('lineDetail', { sceneId, lineId, role });
    this.emit('change', { key: 'readerProgress', value: p }); return true;
  }
  lastReaderPosition() { const p = this.readerProgress(); return p.last || safeParse(safeGet(STORAGE_KEYS.readerLast), null); }

  sceneProgress() { return safeParse(safeGet(STORAGE_KEYS.sceneProgress), {}) || {}; }
  setSceneProgress(sceneId, percent) { if (!sceneIds.has(sceneId)) return false; const p = this.sceneProgress(), next = Math.max(0, Math.min(100, Number(percent) || 0)); p[sceneId] = Math.max(Number(p[sceneId]) || 0, next); jsonSet(STORAGE_KEYS.sceneProgress, p); this.emit('change', { key: 'sceneProgress', sceneId, value: p[sceneId] }); return p[sceneId]; }
  cueStates() { return safeParse(safeGet(STORAGE_KEYS.cueState), {}) || {}; }
  cueRatings() { return safeParse(safeGet(STORAGE_KEYS.cueRatings), {}) || {}; }
  rehearsalStates() { return safeParse(safeGet(STORAGE_KEYS.rehearsalState), {}) || {}; }
  memoryStages() { return safeParse(safeGet(STORAGE_KEYS.memoryStages), {}) || {}; }
  sessionKey(sceneId, role) { return `${sceneId}|${role}`; }
  saveCueState(sceneId, role, state) {
    const all = this.cueStates(); all[this.sessionKey(sceneId, role)] = { sceneId, character: role, ...state, updatedAt: stamp() };
    jsonSet(STORAGE_KEYS.cueState, all);
    const current = all[this.sessionKey(sceneId, role)];
    jsonSet(STORAGE_KEYS.practiceLast, { mode: 'cue', sceneId, current: Number(current.index || 0) + 1, total: Number(current.total || 0), character: role, lineId: current.speechId || '', updatedAt: current.updatedAt });
    this.saveResume('cue', { sceneId, role, lineId: current.speechId || '', current: Number(current.index || 0) + 1, total: Number(current.total || 0), completed: !!current.finished });
    return current;
  }
  getCueState(sceneId, role) { return this.cueStates()[this.sessionKey(sceneId, role)] || null; }
  rateCue({ lineId, sceneId, role, rating }) { if (!lineId || !RATING_VALUES.includes(rating)) return false; const all = this.cueRatings(), old = all[lineId] || {}, updatedAt = stamp(); all[lineId] = { ...old, rating, last: rating, attempts: (Number(old.attempts) || 0) + 1, again: (Number(old.again) || 0) + (rating === 'again' ? 1 : 0), hard: (Number(old.hard) || 0) + (rating === 'hard' ? 1 : 0), good: (Number(old.good) || 0) + (rating === 'good' ? 1 : 0), sceneId, character: role, updatedAt }; jsonSet(STORAGE_KEYS.cueRatings, all); this.applyMemoryRating(lineId, rating, updatedAt); this.emit('change', { key: 'cueRating', lineId, rating }); return all[lineId]; }
  applyMemoryRating(lineId, rating, ratingUpdate) { const all = this.memoryStages(); let stage = Math.max(0, Math.min(3, Number(all[lineId]?.stage) || 0)); if (rating === 'good') stage = Math.min(3, stage + 1); else if (rating === 'again') stage = Math.max(0, stage - 1); all[lineId] = { stage, ratingUpdate }; jsonSet(STORAGE_KEYS.memoryStages, all); }

  rehearsalPrefs() { const p = safeParse(safeGet(STORAGE_KEYS.rehearsalPrefs), {}) || {}; return { tts: !!p.tts, auto: !!p.auto }; }
  setRehearsalPrefs(prefs) { const next = { tts: !!prefs.tts, auto: !!prefs.auto }; jsonSet(STORAGE_KEYS.rehearsalPrefs, next); return next; }
  getRehearsalState(sceneId, role) { return this.rehearsalStates()[this.sessionKey(sceneId, role)] || null; }
  saveRehearsalState(sceneId, role, state) {
    const all = this.rehearsalStates(), updatedAt = stamp(); all[this.sessionKey(sceneId, role)] = { sceneId, character: role, ...state, updatedAt };
    jsonSet(STORAGE_KEYS.rehearsalState, all);
    jsonSet(STORAGE_KEYS.practiceLast, { mode: 'rehearsal', sceneId, current: Math.min(Number(state.index || 0) + 1, Number(state.total || 0)), total: Number(state.total || 0), character: role, lineId: state.speechId || '', completed: !!state.finished, updatedAt });
    this.saveResume('rehearsal', { sceneId, role, lineId: state.speechId || '', current: Math.min(Number(state.index || 0) + 1, Number(state.total || 0)), total: Number(state.total || 0), completed: !!state.finished });
    return all[this.sessionKey(sceneId, role)];
  }

  setPracticePending(value) { jsonSet(STORAGE_KEYS.practicePending, value); }
  getPracticePending() { return safeParse(safeGet(STORAGE_KEYS.practicePending), null); }
  clearPracticePending() { safeRemove(STORAGE_KEYS.practicePending); }

  sanitize() {
    const scene = this.selectedScene(); safeSet(STORAGE_KEYS.selectedScene, scene);
    const rawRole = safeGet(STORAGE_KEYS.character); if (rawRole && !CAST.includes(rawRole)) safeRemove(STORAGE_KEYS.character);
    this.setReaderMode(this.readerMode());
    if (!this.data.hasCore()) return;
    const validLine = (sceneId, lineId) => !!this.data.getSpeech(sceneId, lineId);
    const current = safeParse(safeGet(STORAGE_KEYS.lineCurrent), null); if (current && (!sceneIds.has(current.sceneId) || !validLine(current.sceneId, current.lineId))) safeRemove(STORAGE_KEYS.lineCurrent);
    const pending = this.getPracticePending(); if (pending && (!sceneIds.has(pending.sceneId) || (pending.lineId && !validLine(pending.sceneId, pending.lineId)))) this.clearPracticePending();
    const p = this.readerProgress(), validIds = this.data.speechById;
    p.globalSeen = p.globalSeen.filter(id => validIds.has(id));
    for (const key of Object.keys(p.roles)) { if (!CAST.includes(key) || !Array.isArray(p.roles[key])) delete p.roles[key]; else p.roles[key] = p.roles[key].filter(id => validIds.has(id)); }
    if (p.last && (!sceneIds.has(p.last.sceneId) || !validLine(p.last.sceneId, p.last.lineId))) p.last = null;
    jsonSet(STORAGE_KEYS.readerProgress, p);
    const bookmarks = this.bookmarks();
    for (const [lineId, entry] of Object.entries(bookmarks)) if (!entry || !sceneIds.has(entry.sceneId) || !validLine(entry.sceneId, lineId)) delete bookmarks[lineId];
    jsonSet(STORAGE_KEYS.bookmarks, bookmarks);
    const resumes = this.resumeState();
    for (const kind of ['script', 'cue', 'rehearsal', 'lineDetail']) { const r = resumes[kind]; if (!r) continue; if (!sceneIds.has(r.sceneId) || (r.lineId && !validLine(r.sceneId, r.lineId)) || (r.role && !CAST.includes(r.role))) resumes[kind] = null; }
    jsonSet(STORAGE_KEYS.resume, resumes);
  }
}
