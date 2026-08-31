const SHIORI_STORAGE_KEY = 'mts.shiori.v1';

export class ResumeBookmarksUI {
  constructor({ app, store, state, go, chrome, sceneMeta, esc }) {
    this.app = app;
    this.store = store;
    this.state = state;
    this.go = go;
    this.chrome = chrome;
    this.sceneMeta = sceneMeta;
    this.esc = esc;
    this.undoTimer = 0;
  }

  afterRoute(path, q = new URLSearchParams()) {
    if (path === '/home') this.decorateHome();
    else if (path === '/script') this.decorateScript();
    else if (path === '/line') this.decorateLine(q);
    else if (path === '/more') this.decorateMore();
  }

  shiori() {
    try {
      const raw = localStorage.getItem(SHIORI_STORAGE_KEY);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || typeof entry !== 'object' || !entry.sceneId || !entry.lineId) {
        localStorage.removeItem(SHIORI_STORAGE_KEY);
        return null;
      }
      if (this.store.hasCore() && !this.store.getSpeech(entry.sceneId, entry.lineId)) {
        localStorage.removeItem(SHIORI_STORAGE_KEY);
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  }

  setShiori(sceneId, lineId) {
    if (!sceneId || !lineId || (this.store.hasCore() && !this.store.getSpeech(sceneId, lineId))) return false;
    const previous = this.shiori();
    const entry = { sceneId, lineId, updatedAt: new Date().toISOString() };
    try {
      localStorage.setItem(SHIORI_STORAGE_KEY, JSON.stringify(entry));
    } catch {
      return false;
    }
    return { entry, previous, moved: !!previous && previous.lineId !== lineId };
  }

  isShiori(lineId) {
    return this.shiori()?.lineId === lineId;
  }

  shioriResume() {
    const entry = this.shiori();
    return entry ? { ...entry, kind: 'script', shiori: true } : null;
  }

  resumeTitle(entry) {
    if (!entry) return '';
    if (entry.kind === 'cue') return 'Cue Practice';
    if (entry.kind === 'rehearsal') return 'Rehearsal';
    if (entry.kind === 'lineDetail') return 'Line Detail';
    return 'Script';
  }

  resumeMeta(entry) {
    if (!entry) return '';
    const bits = [this.sceneMeta(entry.sceneId).label];
    if (entry.shiori) bits.push('Reading marker');
    if (entry.kind === 'script' && entry.readerMode) bits.push(entry.readerMode === 'full' ? 'Full' : entry.readerMode === 'mine' ? 'Mine' : 'Cue Focus');
    if (entry.role) bits.push(entry.role);
    if (entry.total) bits.push(`${Math.min(Number(entry.current) || 1, Number(entry.total) || 1)} / ${Number(entry.total) || 0}`);
    return bits.join(' · ');
  }

  applyResume(entry) {
    if (!entry) return;
    if (entry.sceneId) this.state.setScene(entry.sceneId);
    if (entry.role) this.state.setRole(entry.role);
    if (entry.readerMode) this.state.setReaderMode(entry.readerMode);
    if (entry.kind === 'cue') this.go(`#/cue?scene=${encodeURIComponent(entry.sceneId)}`);
    else if (entry.kind === 'rehearsal') this.go(`#/rehearsal?scene=${encodeURIComponent(entry.sceneId)}`);
    else if (entry.kind === 'lineDetail' && entry.lineId) this.go(`#/line?scene=${encodeURIComponent(entry.sceneId)}&line=${encodeURIComponent(entry.lineId)}`);
    else this.go(`#/script${entry.lineId ? `?line=${encodeURIComponent(entry.lineId)}` : ''}`);
  }

  decorateHome() {
    const shell = this.app.querySelector('.shell');
    const header = shell?.querySelector('.app-top');
    if (!shell || !header) return;
    shell.querySelector('[data-resume-home]')?.remove();
    shell.querySelector('[data-bookmarks-home]')?.remove();
    const latest = this.shioriResume() || this.state.latestResume();
    const practice = this.state.latestPracticeResume();
    if (latest) {
      const section = document.createElement('section');
      section.className = 'card resume-card';
      section.dataset.resumeHome = '1';
      section.innerHTML = `<div class="eyebrow">Continue</div><div class="resume-main"><div><h2>Continue ${this.esc(this.resumeTitle(latest))}</h2><p>${this.esc(this.resumeMeta(latest))}</p></div><button class="primary-btn" type="button" data-resume-primary>Continue</button></div>${practice && practice.kind !== latest.kind ? `<button class="resume-practice-link" type="button" data-resume-practice>Resume Practice · ${this.esc(this.resumeTitle(practice))}</button>` : ''}`;
      header.insertAdjacentElement('afterend', section);
      section.querySelector('[data-resume-primary]').onclick = () => this.applyResume(latest);
      section.querySelector('[data-resume-practice]')?.addEventListener('click', () => this.applyResume(practice));
    }
    const rows = this.canonicalBookmarks('all');
    const count = rows.length;
    const bookmarkCard = document.createElement('section');
    bookmarkCard.className = 'card bookmark-home-card';
    bookmarkCard.dataset.bookmarksHome = '1';
    bookmarkCard.innerHTML = `<div class="bookmark-home-head"><div><div class="eyebrow">Bookmarks</div><h3>${count} ${count === 1 ? 'line' : 'lines'} saved</h3></div><button class="ghost-btn" type="button" data-open-bookmarks>View All</button></div><div class="home-bookmark-scroll" data-home-bookmark-scroll>${rows.length ? rows.map(x => `<div class="bookmark-row home-bookmark-row" data-home-bookmark-row="${this.esc(x.lineId)}"><button type="button" class="bookmark-open" data-home-bookmark-open="${this.esc(x.lineId)}" data-home-bookmark-scene="${this.esc(x.sceneId)}"><span><b>${this.esc(x.speech.speaker)}</b> · ${this.esc(this.sceneMeta(x.sceneId).label)}</span><span>${this.esc(x.speech.text)}</span></button><button type="button" class="bookmark-remove" aria-label="Remove bookmark" data-home-bookmark-remove="${this.esc(x.lineId)}">★</button></div>`).join('') : '<div class="home-bookmark-empty"><p class="muted">No bookmarks yet. Tap ☆ beside a line to save it here.</p></div>'}</div>`;
    const sceneGrid = shell.querySelector('.scene-grid');
    (sceneGrid || shell.lastElementChild).insertAdjacentElement('afterend', bookmarkCard);
    bookmarkCard.querySelector('[data-open-bookmarks]').onclick = () => this.go('#/bookmarks');
    bookmarkCard.querySelectorAll('[data-home-bookmark-open]').forEach(button => button.onclick = () => {
      this.state.setScene(button.dataset.homeBookmarkScene);
      this.go(`#/line?scene=${encodeURIComponent(button.dataset.homeBookmarkScene)}&line=${encodeURIComponent(button.dataset.homeBookmarkOpen)}`);
    });
    bookmarkCard.querySelectorAll('[data-home-bookmark-remove]').forEach(button => button.onclick = () => {
      const lineId = button.dataset.homeBookmarkRemove;
      const removed = this.state.removeBookmark(lineId);
      if (!removed || this.state.isBookmarked(lineId)) {
        this.showToast('Bookmark could not be removed');
        return;
      }
      this.decorateHome();
      this.showToast('Bookmark removed', removed);
    });
  }

  syncBookmarkToggle(el, lineId) {
    const active = this.state.isBookmarked(lineId);
    el.classList.toggle('active', active);
    el.textContent = active ? '★' : '☆';
    el.setAttribute('aria-label', active ? 'Remove bookmark' : 'Add bookmark');
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
    return active;
  }

  bookmarkToggle(sceneId, lineId, className = '') {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `bookmark-toggle ${className}`.trim();
    el.dataset.bookmarkToggle = lineId;
    this.syncBookmarkToggle(el, lineId);
    const toggle = event => {
      event.preventDefault();
      event.stopPropagation();
      const result = this.state.toggleBookmark(sceneId, lineId);
      const now = this.syncBookmarkToggle(el, lineId);
      if (!result?.changed) {
        this.showToast(now ? 'Bookmark could not be removed' : 'Bookmark could not be saved');
        return;
      }
      this.showToast(now ? 'Bookmark added' : 'Bookmark removed', now ? null : result.removed || null);
    };
    el.addEventListener('click', toggle);
    return el;
  }

  shioriToggle(sceneId, lineId, className = '') {
    const active = this.isShiori(lineId);
    const el = document.createElement('span');
    el.className = `bookmark-toggle shiori-toggle ${active ? 'active' : ''} ${className}`.trim();
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', active ? 'Reading marker is here' : 'Set reading marker here');
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
    el.dataset.shioriToggle = lineId;
    const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    glyph.setAttribute('viewBox', '0 0 24 28');
    glyph.setAttribute('width', '18');
    glyph.setAttribute('height', '22');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.setAttribute('data-shiori-glyph', '1');
    glyph.style.pointerEvents = 'none';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M5 2h14v23l-7-5-7 5V2z');
    path.setAttribute('fill', active ? 'currentColor' : 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2.2');
    path.setAttribute('stroke-linejoin', 'round');
    glyph.append(path);
    el.append(glyph);
    const set = event => {
      event.preventDefault();
      event.stopPropagation();
      const result = this.setShiori(sceneId, lineId);
      if (!result) {
        this.showToast('Reading marker could not be saved');
        return;
      }
      this.app.querySelectorAll('[data-shiori-toggle]').forEach(button => {
        const selected = button.dataset.shioriToggle === lineId;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        button.setAttribute('aria-label', selected ? 'Reading marker is here' : 'Set reading marker here');
        const icon = button.querySelector('[data-shiori-glyph] path');
        if (icon) icon.setAttribute('fill', selected ? 'currentColor' : 'none');
      });
      this.showToast(result.moved ? 'Reading marker moved' : 'Reading marker set');
    };
    el.addEventListener('click', set);
    el.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') set(event); });
    return el;
  }

  decorateScript() {
    const sceneId = this.state.selectedScene();
    this.app.querySelectorAll('[data-line]').forEach(row => {
      const lineId = row.dataset.line;
      if (!lineId) return;
      row.classList.add('bookmarkable-line');
      row.style.paddingRight = '96px';
      if (!row.querySelector('[data-shiori-toggle]')) {
        const shiori = this.shioriToggle(sceneId, lineId, 'line-shiori-toggle');
        shiori.style.cssText += 'position:absolute;right:53px;top:50%;transform:translateY(-50%);';
        row.append(shiori);
      }
      if (!row.querySelector('[data-bookmark-toggle]')) row.append(this.bookmarkToggle(sceneId, lineId, 'line-bookmark-toggle'));
    });
  }

  decorateLine(q) {
    const sceneId = q.get('scene');
    const lineId = q.get('line');
    if (!sceneId || !lineId || !this.store.getSpeech(sceneId, lineId)) return;
    const card = this.app.querySelector('.line-page .card');
    if (!card) return;
    let holder = card.querySelector('.line-bookmark-holder');
    if (!holder) {
      holder = document.createElement('div');
      holder.className = 'line-bookmark-holder';
      card.prepend(holder);
    }
    if (!holder.querySelector('[data-shiori-toggle]')) holder.append(this.shioriToggle(sceneId, lineId, 'line-detail-shiori'));
    if (!holder.querySelector('[data-bookmark-toggle]')) holder.append(this.bookmarkToggle(sceneId, lineId, 'line-detail-bookmark'));
  }

  decorateMore() {
    const tools = this.app.querySelector('.shell .card:last-of-type .toolbar');
    if (!tools || tools.querySelector('[data-more-bookmarks]')) return;
    const button = document.createElement('button');
    button.className = 'ghost-btn';
    button.type = 'button';
    button.dataset.moreBookmarks = '1';
    button.textContent = `Bookmarks (${Object.keys(this.state.bookmarks()).length})`;
    button.onclick = () => this.go('#/bookmarks');
    tools.append(button);
  }

  canonicalBookmarks(filter = 'all') {
    const all = this.state.bookmarks();
    const rows = [];
    for (const scene of this.store.hasCore() ? ['act1-scene1', 'act1-scene2', 'act2'] : []) {
      if (filter !== 'all' && filter !== scene) continue;
      for (const speech of this.store.getScene(scene)) {
        const saved = all[speech.id];
        if (saved) rows.push({ ...saved, speech });
      }
    }
    return rows;
  }

  renderBookmarks(q = new URLSearchParams()) {
    const filter = ['act1-scene1', 'act1-scene2', 'act2'].includes(q.get('scene')) ? q.get('scene') : 'all';
    if (!this.store.hasCore()) {
      this.chrome('<section class="card"><div class="eyebrow">Bookmarks</div><h2>Bookmarks</h2><p class="muted">Loading script data…</p></section>', 'more');
      return;
    }
    const rows = this.canonicalBookmarks(filter);
    const filters = [{ id: 'all', label: 'All' }, ...['act1-scene1', 'act1-scene2', 'act2'].map(id => ({ id, label: this.sceneMeta(id).label }))];
    this.chrome(`<section class="card bookmark-list-head"><div class="eyebrow">Bookmarks</div><h2>Bookmarks</h2><p class="muted">Tap a line to open Line Detail. Tap ★ to remove it instantly.</p><div class="bookmark-filters">${filters.map(x => `<button type="button" class="ghost-btn ${filter === x.id ? 'selected-tool' : ''}" data-bookmark-filter="${x.id}">${this.esc(x.label)}</button>`).join('')}</div></section><section class="bookmark-list" data-bookmark-list>${rows.length ? rows.map(x => `<div class="bookmark-row" data-bookmark-row="${this.esc(x.lineId)}"><button type="button" class="bookmark-open" data-bookmark-open="${this.esc(x.lineId)}" data-bookmark-scene="${this.esc(x.sceneId)}"><span><b>${this.esc(x.speech.speaker)}</b> · ${this.esc(this.sceneMeta(x.sceneId).label)}</span><span>${this.esc(x.speech.text)}</span></button><button type="button" class="bookmark-remove" aria-label="Remove bookmark" data-bookmark-remove="${this.esc(x.lineId)}">★</button></div>`).join('') : '<div class="card bookmark-empty"><h3>No bookmarks yet</h3><p class="muted">Tap ☆ in Script or Line Detail to save a line here.</p><button class="primary-btn" type="button" data-bookmark-go-script>Open Script</button></div>'}</section>`, 'more');
    this.app.querySelectorAll('[data-bookmark-filter]').forEach(button => button.onclick = () => this.go(button.dataset.bookmarkFilter === 'all' ? '#/bookmarks' : `#/bookmarks?scene=${encodeURIComponent(button.dataset.bookmarkFilter)}`));
    this.app.querySelectorAll('[data-bookmark-open]').forEach(button => button.onclick = () => { this.state.setScene(button.dataset.bookmarkScene); this.go(`#/line?scene=${encodeURIComponent(button.dataset.bookmarkScene)}&line=${encodeURIComponent(button.dataset.bookmarkOpen)}`); });
    this.app.querySelectorAll('[data-bookmark-remove]').forEach(button => button.onclick = () => {
      const lineId = button.dataset.bookmarkRemove;
      const removed = this.state.removeBookmark(lineId);
      if (!removed || this.state.isBookmarked(lineId)) {
        this.showToast('Bookmark could not be removed');
        return;
      }
      button.closest('[data-bookmark-row]')?.remove();
      if (!this.app.querySelector('[data-bookmark-row]')) this.renderBookmarks(new URLSearchParams(location.hash.split('?')[1] || ''));
      this.showToast('Bookmark removed', removed);
    });
    this.app.querySelector('[data-bookmark-go-script]')?.addEventListener('click', () => this.go('#/script'));
  }

  showToast(message, undoEntry = null) {
    const host = document.getElementById('toast');
    if (!host) return;
    clearTimeout(this.undoTimer);
    host.replaceChildren();
    const text = document.createElement('span');
    text.textContent = message;
    host.append(text);
    host.classList.toggle('actionable', !!undoEntry);
    if (undoEntry) {
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.textContent = 'Undo';
      undo.onclick = () => {
        const restored = this.state.restoreBookmark(undoEntry);
        if (!restored || !this.state.isBookmarked(undoEntry.lineId)) {
          this.showToast('Bookmark could not be restored');
          return;
        }
        host.classList.remove('show', 'actionable');
        if (location.hash.startsWith('#/bookmarks')) this.renderBookmarks(new URLSearchParams(location.hash.split('?')[1] || ''));
        else this.afterRoute(location.hash.replace(/^#/, '').split('?')[0] || '/home', new URLSearchParams(location.hash.split('?')[1] || ''));
      };
      host.append(undo);
    }
    host.classList.add('show');
    this.undoTimer = setTimeout(() => host.classList.remove('show', 'actionable'), 3500);
  }
}
