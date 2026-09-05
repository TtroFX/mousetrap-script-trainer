import { speechController } from './speech-controller.js';

const OWNER_PREFIX = 'line-detail:';
const BUTTON_SELECTOR = '[data-line-read-aloud]';

export const lineSpeechOwner = (sceneId, lineId) => `${OWNER_PREFIX}${sceneId}:${lineId}`;

function speakerGlyph(active = false) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" data-read-aloud-glyph="1">
    <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"></path>
    <path d="M16 8.2c1.25 1 1.9 2.25 1.9 3.8s-.65 2.8-1.9 3.8M18.7 5.7c2.05 1.75 3.1 3.85 3.1 6.3s-1.05 4.55-3.1 6.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ${active ? '' : 'opacity=".78"'}></path>
  </svg>`;
}

export function readAloudPreviewHtml(lineId = '') {
  const id = String(lineId || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  return `<span class="bookmark-toggle line-read-aloud-toggle line-detail-read-aloud" data-line-read-aloud-preview="${id}" aria-hidden="true">${speakerGlyph(false)}</span>`;
}

function applyButtonState(button) {
  if (!button) return;
  const status = speechController.diagnostics();
  const owner = button.dataset.speechOwner || '';
  const active = status.active && status.owner === owner;
  const queued = active && status.phase === 'queued';
  const speaking = active && status.phase === 'speaking';
  const available = speechController.supported();

  button.classList.toggle('active', active);
  button.classList.toggle('is-queued', queued);
  button.classList.toggle('is-speaking', speaking);
  button.disabled = !available;
  button.setAttribute('aria-disabled', available ? 'false' : 'true');
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
  button.setAttribute('aria-label', !available ? 'Read aloud unavailable' : active ? 'Stop reading line' : 'Read line aloud');
  button.title = !available ? 'Read aloud unavailable on this device' : active ? 'Stop reading line' : 'Read line aloud';
  button.innerHTML = speakerGlyph(active);
}

export function syncReadAloudControls(root = document) {
  root.querySelectorAll?.(BUTTON_SELECTOR).forEach(applyButtonState);
}

export function createLineReadAloudButton({
  store,
  sceneId,
  lineId,
  className = 'line-detail-read-aloud',
  onUnavailable = null,
  onError = null,
} = {}) {
  const speech = store?.getSpeech?.(sceneId, lineId);
  if (!speech) return null;

  const owner = lineSpeechOwner(sceneId, lineId);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `bookmark-toggle line-read-aloud-toggle ${className}`.trim();
  button.dataset.lineReadAloud = lineId;
  button.dataset.speechOwner = owner;

  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();

    if (!speechController.supported()) {
      onUnavailable?.();
      applyButtonState(button);
      return;
    }

    if (speechController.isSpeaking(owner)) {
      speechController.cancel(owner, 'toggle-stop');
      return;
    }

    const started = speechController.speak({
      text: speech.text,
      owner,
      lang: 'en-GB',
      onError: error => onError?.(error),
    });
    if (!started) onUnavailable?.();
    applyButtonState(button);
  });

  applyButtonState(button);
  return button;
}

export function mountLineReadAloud({ holder, store, sceneId, lineId, onUnavailable = null, onError = null } = {}) {
  if (!holder || !store || !sceneId || !lineId) return null;
  const existing = holder.querySelector(BUTTON_SELECTOR);
  if (existing) {
    applyButtonState(existing);
    return existing;
  }

  const button = createLineReadAloudButton({ store, sceneId, lineId, onUnavailable, onError });
  if (!button) return null;

  // Contract: read-aloud sits immediately to the LEFT of the reading-marker (shiori).
  const shiori = holder.querySelector('[data-shiori-toggle]');
  if (shiori) holder.insertBefore(button, shiori);
  else holder.prepend(button);
  return button;
}

speechController.addEventListener('state', () => syncReadAloudControls());
speechController.addEventListener('voices', () => syncReadAloudControls());

window.MTS_LINE_READ_ALOUD = Object.freeze({
  lineSpeechOwner,
  readAloudPreviewHtml,
  createLineReadAloudButton,
  mountLineReadAloud,
  syncReadAloudControls,
});
