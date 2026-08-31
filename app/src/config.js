export const BUILD_ID = 'index-zero-2026-09-01-r27';

export const SCENES = Object.freeze([
  { id: 'act1-scene1', label: 'Act I · Scene I', count: 190 },
  { id: 'act1-scene2', label: 'Act I · Scene II', count: 336 },
  { id: 'act2', label: 'Act II', count: 638 },
]);

export const CAST = Object.freeze([
  'MOLLIE', 'TROTTER', 'GILES', 'MISS CASEWELL',
  'CHRISTOPHER', 'MRS. BOYLE', 'PARAVICINI', 'MAJOR METCALF',
]);

export const DATA_PATHS = Object.freeze({
  script: './mousetrap_script_data.json',
  translations: './mousetrap_line_translations.json',
  interpretation: './mousetrap_line_interpretation.json',
  vocabulary: './mousetrap_line_vocabulary.json',
  grammar: './mousetrap_line_grammar.json',
  dictionary: './mousetrap_word_dictionary.json',
  structure: './mousetrap_line_structure.json',
  stageDirections: './src/mousetrap_stage_directions.json',
});

export const STORAGE_KEYS = Object.freeze({
  selectedScene: 'mts.selectedSceneId',
  character: 'mts.characterId',
  lineCurrent: 'mts.lineDetail.current',
  practicePending: 'mts.practice.pending',
  practiceLast: 'mts.practice.lastSession',
  sceneProgress: 'mts.sceneProgress',
  cueRatings: 'mts.practice.cue.ratings',
  cueState: 'mts.practice.cue.state',
  rehearsalState: 'mts.practice.rehearsal.state',
  rehearsalPrefs: 'mts.practice.rehearsal.prefs',
  readerMode: 'mts.reader.mode',
  readerProgress: 'mts.reader.progress',
  readerLast: 'mts.reader.lastPosition',
  memoryStages: 'mts.memory.stages',
  resume: 'mts.resume.v1',
  bookmarks: 'mts.bookmarks.v1',
  stageDirectionsVisible: 'mts.stageDirections.visible',
});

export const READER_MODES = Object.freeze(['full', 'mine', 'cue']);
export const RATING_VALUES = Object.freeze(['again', 'hard', 'good']);
export const CORE_TIMEOUT_MS = 10000;
export const STUDY_TIMEOUT_MS = 12000;
export const STRUCTURE_TIMEOUT_MS = 12000;
export const STAGE_TIMEOUT_MS = 12000;
